#!/usr/bin/env python3
"""从 mdict 词典中为目标词条抽取例句，输出 TSV。

数据来源（按优先级）：
  1. 牛津高阶（英汉双解）—— 带中文译文
  2. 柯林斯 COBUILD —— 带中文译文

做法：先扫一遍词典把例句全部收进句子池，再拿词表/短语表去匹配。
单词按词形变化匹配，短语按字面子串匹配（带 one's → his/her 通配）。

用法：
  python3 scripts/extract_examples.py            # 全部书 + 全部扩充短语
  python3 scripts/extract_examples.py --limit 20 # 抽样
  python3 scripts/extract_examples.py --per-word 3
"""
from __future__ import annotations

import argparse
import html
import os
import re
import sys
from pathlib import Path

from mdict_utils.base.readmdict import MDX

ROOT = Path(__file__).resolve().parent.parent
LEXICON = {
    "oxford": "/storage/emulated/0/Download/mdict/牛津英汉双解/牛津高阶.mdx",
    "collins": "/storage/emulated/0/Download/mdict/柯林斯CollinsCOBUILDOverhaul/CollinsCOBUILDOverhaul.mdx",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")
PROPER_RE = re.compile(r"\b[A-Z][a-z]{2,}\b")


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<span class=\"gloss\"[^>]*>.*?</span>", "", fragment, flags=re.S)
    fragment = re.sub(r"<[^>]*>", "", fragment)
    fragment = html.unescape(fragment)
    return re.sub(r"\s+", " ", fragment).strip()


def oxford_examples(page: str) -> list[tuple[str, str]]:
    out = []
    # 例句在牛津里是 <span class="x">EN</span><xT><chn>ZH</chn></xT>，
    # 锚定紧随的 <xT> 才不会把后面的标签吞进来。
    rx = re.compile(r'<span class="x"[^>]*>(.*?)</span>\s*<xT>\s*<chn>(.*?)</chn>', re.S)
    for m in rx.finditer(page):
        en = strip_tags(m.group(1))
        zh = strip_tags(m.group(2))
        if en:
            out.append((en, zh))
    # 少数例句没有中文，仍可用
    for m in re.finditer(r'<span class="x"[^>]*>(.*?)</span>', page, flags=re.S):
        en = strip_tags(m.group(1))
        if en and not any(en == e for e, _ in out):
            out.append((en, ""))
    return out


def collins_examples(page: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(
        r"<li>\s*<p>(.*?)</p>\s*<p><span class=\"chinese-text\">(.*?)</span></p>",
        page, flags=re.S,
    ):
        en = strip_tags(m.group(1))
        zh = strip_tags(m.group(2))
        if en:
            out.append((en, zh))
    return out


def read_tsv(path: Path) -> list[list[str]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def inflections(word: str) -> set[str]:
    w = word.lower()
    forms = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "est", w + "ly"}
    if w.endswith("e"):
        forms |= {w[:-1] + "ing", w[:-1] + "ed", w[:-1] + "er", w[:-1] + "est"}
    if w.endswith("y"):
        forms |= {w[:-1] + "ies", w[:-1] + "ied", w[:-1] + "ier", w[:-1] + "iest"}
    if len(w) > 3 and w[-1] not in "aeiou" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        forms |= {w + w[-1] + "ing", w + w[-1] + "ed", w + w[-1] + "er", w + w[-1] + "est"}
    return forms


def score(sentence: str) -> float:
    """越高越适合做高中练习题。"""
    tokens = TOKEN_RE.findall(sentence)
    n = len(tokens)
    if not 4 <= n <= 24:
        return -1.0
    s = 10.0
    s -= abs(n - 10) * 0.5
    if not sentence.endswith((".", "?", "!")):
        s -= 2
    proper = PROPER_RE.findall(sentence)[1:]
    s -= len(proper) * 1.5
    if "|" in sentence or "..." in sentence or "…" in sentence:
        s -= 5
    if "=" in sentence or "(" in sentence:
        s -= 2
    return s


def phrase_regex(phrase: str) -> re.Pattern | None:
    """把短语编成正则；带省略号的短语匹配不了，返回 None。"""
    if "..." in phrase or "…" in phrase:
        return None
    parts = []
    for tok in re.split(r"\s+", phrase.strip()):
        if tok.lower() == "one's":
            parts.append(r"(?:one's|his|her|my|your|their|our|its)")
        else:
            parts.append(re.escape(tok))
    return re.compile(r"(?<![A-Za-z])" + r"\s+".join(parts) + r"(?![A-Za-z])", re.I)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 个词条，抽样用")
    ap.add_argument("--per-word", type=int, default=2)
    args = ap.parse_args()

    # 目标：所有教材词表 + 所有扩充短语
    targets: list[tuple[str, int, str]] = []  # (key, unit, kind)
    seen: set[str] = set()
    for p in sorted((ROOT / "data/books").glob("*.tsv")):
        for row in read_tsv(p):
            word = row[2].strip()
            if word.lower() in seen:
                continue
            seen.add(word.lower())
            targets.append((word, int(row[0]), "word"))
    for p in sorted((ROOT / "data/phrases").glob("*.tsv")):
        for row in read_tsv(p):
            phrase = row[1].strip()
            if phrase.lower() in seen:
                continue
            seen.add(phrase.lower())
            targets.append((phrase, int(row[0]), "phrase"))
    if args.limit:
        targets = targets[: args.limit]
    print(f"目标 {len(targets)} 条（词 + 短语）", file=sys.stderr)

    # 扫词典：同时按 head 收词形例句，并把全部例句堆进池子供短语匹配
    by_head: dict[str, list[tuple[str, str, str]]] = {}
    pool: list[tuple[str, str, str]] = []  # (en, zh, source)
    pool_seen: set[str] = set()
    wanted = {t[0].lower() for t in targets}
    for source, path in LEXICON.items():
        if not os.path.exists(path):
            print(f"跳过缺失词典 {source}: {path}", file=sys.stderr)
            continue
        print(f"扫描 {source} …", file=sys.stderr)
        for key, value in MDX(path).items():
            try:
                head = key.decode("utf-8").strip().lower()
            except UnicodeDecodeError:
                continue
            page = value.decode("utf-8", "replace")
            if page.startswith("@@@LINK="):
                continue
            examples = oxford_examples(page) if source == "oxford" else collins_examples(page)
            for en, zh in examples:
                if not en or CJK_RE.search(en):
                    continue
                if head in wanted:
                    by_head.setdefault(head, []).append((en, zh, source))
                key_s = en[:70].lower()
                if key_s not in pool_seen:
                    pool_seen.add(key_s)
                    pool.append((en, zh, source))
    print(f"句子池 {len(pool)} 句", file=sys.stderr)

    out_path = ROOT / "data/examples/examples.tsv"
    missing: list[str] = []
    rows_out: list[str] = []
    used: set[tuple[str, str]] = set()
    for key, unit, kind in targets:
        low = key.lower()
        if kind == "word":
            forms = inflections(low)
            cands = [(e, z, s) for e, z, s in by_head.get(low, [])
                     if any(t.lower() in forms for t in TOKEN_RE.findall(e))]
        else:
            rx = phrase_regex(low)
            cands = [] if rx is None else [(e, z, s) for e, z, s in pool if rx.search(e)]
        cands.sort(key=lambda c: score(c[0]), reverse=True)
        picked = [c for c in cands if score(c[0]) > 0][: args.per_word]
        if not picked:
            missing.append(key)
        for en, zh, source in picked:
            if (low, en) in used:
                continue
            used.add((low, en))
            rows_out.append(f"{low}\t{unit}\t{en}\t{zh}\t{source}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("# word\tunit\ten\tzh\tsource\n" + "\n".join(rows_out) + "\n", encoding="utf-8")
    print(f"写入 {len(rows_out)} 条例句 → {out_path}", file=sys.stderr)
    print(f"未找到例句 {len(missing)} 条：{'，'.join(missing[:40])}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
