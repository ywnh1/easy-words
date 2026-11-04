#!/usr/bin/env python3
"""把词表 TSV + 扩充短语 TSV + 例句 TSV 编译成内嵌 SQLite 种子库。

表结构面向"多书、多来源"设计：以后加四六级、词典词表、别的教材，
只需在 BOOKS 里加一行 + 放一个 TSV，不需要改 schema 或改应用代码。

    data/books/<book_id>.tsv     教材词表（unit/page/word/phonetic/pos/meaning/marker）
    data/phrases/<book_id>.tsv   Learning aid 扩充短语（unit/phrase/note）
    data/examples/*.tsv          例句（word/unit/en/zh/source）

用法：python3 scripts/build_db.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "src-tauri/resources/seed.sqlite"

# 书籍注册表。新增一本书在这里加一行即可。
# kind: textbook / exam / dict —— 前端按 kind 分组展示，不写死书名。
BOOKS = [
    {
        "id": "waiyanshe-required-1",
        "title": "高中英语必修第一册",
        "publisher": "外研社",
        "series": "高中英语",
        "volume": "必修第一册",
        "level": "high-school",
        "kind": "textbook",
        "unit_label": "UNIT",
        "sort_order": 10,
    },
    {
        "id": "waiyanshe-required-2",
        "title": "高中英语必修第二册",
        "publisher": "外研社",
        "series": "高中英语",
        "volume": "必修第二册",
        "level": "high-school",
        "kind": "textbook",
        "unit_label": "UNIT",
        "sort_order": 20,
    },
    {
        "id": "waiyanshe-required-3",
        "title": "高中英语必修第三册",
        "publisher": "外研社",
        "series": "高中英语",
        "volume": "必修第三册",
        "level": "high-school",
        "kind": "textbook",
        "unit_label": "UNIT",
        "sort_order": 30,
    },
    {
        "id": "waiyanshe-selective-1",
        "title": "高中英语选择性必修第一册",
        "publisher": "外研社",
        "series": "高中英语",
        "volume": "选择性必修第一册",
        "level": "high-school",
        "kind": "textbook",
        "unit_label": "UNIT",
        "sort_order": 40,
    },
]

SCHEMA = """
CREATE TABLE books (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    publisher   TEXT,
    series      TEXT,
    volume      TEXT,
    level       TEXT NOT NULL DEFAULT 'high-school',
    kind        TEXT NOT NULL DEFAULT 'textbook',
    unit_label  TEXT NOT NULL DEFAULT 'UNIT',
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE units (
    book_id  TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    unit_no  INTEGER NOT NULL,
    title    TEXT,
    PRIMARY KEY (book_id, unit_no)
);

CREATE TABLE entries (
    id          INTEGER PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    unit_no     INTEGER NOT NULL,
    seq         INTEGER NOT NULL DEFAULT 0,
    page        INTEGER,
    word        TEXT NOT NULL,
    word_lower  TEXT NOT NULL,
    initial     TEXT NOT NULL,
    phonetic    TEXT NOT NULL DEFAULT '',
    pos         TEXT NOT NULL DEFAULT '',
    meaning     TEXT NOT NULL DEFAULT '',
    is_phrase   INTEGER NOT NULL DEFAULT 0,
    marker      TEXT NOT NULL DEFAULT 'none',
    source_kind TEXT NOT NULL DEFAULT 'textbook',
    note        TEXT NOT NULL DEFAULT '',
    UNIQUE (book_id, word, unit_no, source_kind)
);

CREATE TABLE senses (
    id       INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    source   TEXT NOT NULL,
    pos      TEXT NOT NULL DEFAULT '',
    zh       TEXT NOT NULL
);

CREATE TABLE examples (
    id       INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    en       TEXT NOT NULL,
    zh       TEXT NOT NULL DEFAULT '',
    source   TEXT NOT NULL,
    label    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_entries_unit    ON entries(book_id, unit_no);
CREATE INDEX idx_entries_page    ON entries(book_id, page);
CREATE INDEX idx_entries_initial ON entries(initial);
CREATE INDEX idx_entries_lower   ON entries(word_lower);
CREATE INDEX idx_entries_marker  ON entries(marker);
CREATE INDEX idx_examples_entry  ON examples(entry_id);
CREATE INDEX idx_senses_entry    ON senses(entry_id);

PRAGMA user_version = 3;
"""

# 扫描件里出现过的 marker 别名，统一归一。
# 教材上只有两种前置符号：小圆点 • 和空心方框 □。
#   •  —— 与「加星」同级（不作要求），对应 star
#   □  —— 选择性必修单词，对应 box
# 早先把 • 当成方框，导致选择性必修一凭空多出 12 条「方框词」。
MARKER_ALIAS = {"star": "star", "box": "box", "bullet": "star", "none": "none", "": "none"}

# 比较两个释义是否「说的是同一件事」时忽略这些字符
_PUNCT = str.maketrans("", "", "，,；;。.、·… ()（）/／\"'’‘“”")


def norm_meaning(text: str) -> str:
    return text.translate(_PUNCT).strip().lower()


def same_sense(a: str, b: str) -> bool:
    """两条释义是否在说同一件事：字符重合度够高就认为重复。

    只用精确相等会漏掉「情绪紧张，心里发慌」和「心里发慌，紧张」这类
    只是措辞顺序不同的同义写法；而重合度低时（如 wind up 的「上发条」
    与「以…告终」）会判为不同义项，保留下来补充。
    """
    a, b = norm_meaning(a), norm_meaning(b)
    if not a or not b:
        return False
    if a == b:
        return True
    # 一方是另一方的子串（「另外」⊂「除此之外，另外」）也算同一义项
    if a in b or b in a:
        return True
    sa, sb = set(a), set(b)
    return len(sa & sb) / max(len(sa), len(sb)) >= 0.6


def read_tsv(path: Path) -> list[list[str]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def load_phrase_zh() -> dict[str, tuple[str, str]]:
    """扩充短语的中文释义：牛津抽取的优先，缺的用自撰的补。"""
    out: dict[str, tuple[str, str]] = {}
    for name in ("zh-own.tsv", "zh-oxford.tsv"):
        p = ROOT / "data/phrases" / name
        if not p.exists():
            continue
        for row in read_tsv(p):
            if len(row) < 2:
                continue
            phrase, zh = row[0].strip().lower(), row[1].strip()
            source = row[2].strip() if len(row) > 2 else ""
            if not phrase or not zh:
                continue
            # 牛津优先：后写的覆盖先写的
            out[phrase] = (zh, source)
    return out


def load_senses() -> dict[str, list[tuple[str, str, str]]]:
    """word_lower -> [(source, pos, zh)]。

    扫 data/senses/ 下所有 TSV，所以新增来源只要丢一个文件进来：
      senses.tsv       词典抽取（牛津高阶 / 柯林斯 / 牛津双解）
      ai.tsv           AI 翻译，格式同行，source 填 ai
    同一个 (word, source, zh) 会去重，重复导入不会翻倍。
    """
    out: dict[str, list[tuple[str, str, str]]] = {}
    seen: set[tuple[str, str, str]] = set()
    for p in sorted((ROOT / "data/senses").glob("*.tsv")):
        for row in read_tsv(p):
            if len(row) < 4:
                continue
            word, source = row[0].strip().lower(), row[1].strip()
            pos = row[2].strip()
            zh = row[3].strip()
            if not (word and source and zh):
                continue
            key = (word, source, zh)
            if key in seen:
                continue
            seen.add(key)
            out.setdefault(word, []).append((source, pos, zh))
    return out


def load_examples() -> dict[str, list[tuple[str, str, str, str]]]:
    """按小写词形索引例句；跨书的同形词共享例句池。"""
    pool: dict[str, list[tuple[str, str, str, str]]] = {}
    for p in sorted((ROOT / "data/examples").glob("*.tsv")):
        for row in read_tsv(p):
            if len(row) < 4:
                continue
            word, _unit, en, zh = row[0], row[1], row[2], row[3]
            source = row[4] if len(row) > 4 else "own"
            label = "选自牛津" if source.startswith("oxford") else ""
            pool.setdefault(word.lower(), []).append((en, zh, source, label))
    return pool


def main() -> int:
    examples = load_examples()
    phrase_zh = load_phrase_zh()
    senses = load_senses()

    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)

    stats: list[str] = []
    total_entries = 0
    total_examples = 0

    for book in BOOKS:
        book_tsv = ROOT / f"data/books/{book['id']}.tsv"
        if not book_tsv.exists():
            print(f"跳过 {book['id']}：缺少 {book_tsv}", file=sys.stderr)
            continue

        con.execute(
            "INSERT INTO books(id,title,publisher,series,volume,level,kind,unit_label,sort_order)"
            " VALUES(:id,:title,:publisher,:series,:volume,:level,:kind,:unit_label,:sort_order)",
            book,
        )

        rows = read_tsv(book_tsv)
        units = sorted({int(r[0]) for r in rows})
        con.executemany(
            "INSERT INTO units(book_id, unit_no) VALUES(?, ?)",
            [(book["id"], u) for u in units],
        )

        # 教材词表：每条都带音标和中文，seq 保留书内原始顺序
        n_book = 0
        for seq, row in enumerate(rows):
            unit, page, word, phonetic, pos, meaning, marker = (row + [""] * 7)[:7]
            marker = MARKER_ALIAS.get(marker.strip().lower(), "none")
            is_phrase = 1 if (not phonetic.strip()) else 0
            cur = con.execute(
                "INSERT INTO entries(book_id,unit_no,seq,page,word,word_lower,initial,"
                "phonetic,pos,meaning,is_phrase,marker,source_kind)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'textbook')",
                (
                    book["id"],
                    int(unit),
                    seq,
                    int(page) if page.strip().isdigit() else None,
                    word.strip(),
                    word.strip().lower(),
                    word.strip()[:1].lower(),
                    phonetic.strip(),
                    pos.strip(),
                    meaning.strip(),
                    is_phrase,
                    marker,
                ),
            )
            n_book += 1
            entry_id = cur.lastrowid
            # 教材释义作为 textbook 来源，和词典来源一起参与优先级选择
            if meaning.strip():
                con.execute(
                    "INSERT INTO senses(entry_id, source, pos, zh) VALUES(?,?,?,?)",
                    (entry_id, "textbook", pos.strip(), meaning.strip()),
                )
            for src, spos, szh in senses.get(word.strip().lower(), []):
                con.execute(
                    "INSERT INTO senses(entry_id, source, pos, zh) VALUES(?,?,?,?)",
                    (entry_id, src, spos, szh),
                )
            for en, zh, source, label in examples.get(word.strip().lower(), []):
                con.execute(
                    "INSERT INTO examples(entry_id, en, zh, source, label) VALUES(?,?,?,?,?)",
                    (cur.lastrowid, en, zh, source, label),
                )
                total_examples += 1

        # 已收录的教材词条释义，用来判断扩充短语是不是同义重复
        existing: dict[tuple[int, str], list[str]] = {}
        for unit_no, word_lower, meaning in con.execute(
            "SELECT unit_no, word_lower, meaning FROM entries WHERE book_id=?",
            (book["id"],),
        ):
            existing.setdefault((unit_no, word_lower), []).append(norm_meaning(meaning))

        # Learning aid 扩充短语：无音标、无词性，note 存页面上的用法标注（如 informal）
        phrase_tsv = ROOT / f"data/phrases/{book['id']}.tsv"
        n_phrase = 0
        if phrase_tsv.exists():
            for seq, row in enumerate(read_tsv(phrase_tsv)):
                unit, phrase, note = (row + [""] * 3)[:3]
                phrase = phrase.strip()
                if not phrase:
                    continue
                zh, zh_source = phrase_zh.get(phrase.lower(), ("", ""))
                # 同书同单元已有完全同义的词条就不再重复录入；
                # 义项确实不同的（如 wind up 上发条 / 以…告终）保留下来补充
                known = existing.get((int(unit), phrase.lower()), [])
                if zh and any(same_sense(zh, k) for k in known):
                    continue
                cur = con.execute(
                    "INSERT OR IGNORE INTO entries(book_id,unit_no,seq,page,word,word_lower,"
                    "initial,phonetic,pos,meaning,is_phrase,marker,source_kind,note)"
                    " VALUES(?,?,?,NULL,?,?,?,?,'',?,1,'none','extra',?)",
                    (
                        book["id"],
                        int(unit),
                        10000 + seq,
                        phrase,
                        phrase.lower(),
                        phrase[:1].lower(),
                        "",
                        zh,
                        note.strip() or zh_source,
                    ),
                )
                if cur.rowcount:
                    n_phrase += 1
                    if zh:
                        con.execute(
                            "INSERT INTO senses(entry_id, source, pos, zh) VALUES(?,?,?,?)",
                            (cur.lastrowid, "textbook", "", zh),
                        )
                    for src, spos, szh in senses.get(phrase.lower(), []):
                        con.execute(
                            "INSERT INTO senses(entry_id, source, pos, zh) VALUES(?,?,?,?)",
                            (cur.lastrowid, src, spos, szh),
                        )
                    for en, zh, source, label in examples.get(phrase.lower(), []):
                        con.execute(
                            "INSERT INTO examples(entry_id, en, zh, source, label) VALUES(?,?,?,?,?)",
                            (cur.lastrowid, en, zh, source, label),
                        )
                        total_examples += 1

        total_entries += n_book + n_phrase
        stats.append(f"  {book['id']}: {n_book} 词 + {n_phrase} 扩充短语")

    con.commit()
    con.execute("VACUUM")
    con.commit()

    n_missing = con.execute(
        "SELECT COUNT(*) FROM entries WHERE source_kind='extra' AND meaning=''"
    ).fetchone()[0]
    con.close()

    print("\n".join(stats), file=sys.stderr)
    print(
        f"{DB} : {total_entries} 词条, {total_examples} 例句, "
        f"{DB.stat().st_size / 1024:.0f} KB",
        file=sys.stderr,
    )
    if n_missing:
        print(f"注意：{n_missing} 条扩充短语还没有中文释义", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
