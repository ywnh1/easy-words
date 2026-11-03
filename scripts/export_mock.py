#!/usr/bin/env python3
"""从种子库导出一份精简数据，供纯前端预览用。

手机上直接打开 HTML 时没有 Rust 后端，界面要靠这份数据渲染。

关键：导出的元数据（每本书多少条、有哪些单元/页码/首字母）必须和
导出的词条本身一致，否则预览里会出现「书上写着 491 条、实际只能查到 48 条」
「列了 UNIT 1-6 但选 UNIT 2 就空了」这种自相矛盾。

用法：python3 scripts/export_mock.py
输出：src/lib/mock-data.ts
"""
from __future__ import annotations

import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "src-tauri/resources/seed.sqlite"
OUT = ROOT / "src/lib/mock-data.ts"

# 每本书导出多少条，以及覆盖前几个单元
PER_BOOK = 60
UNITS_PER_BOOK = 2


def main() -> int:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    books_meta = list(
        con.execute(
            "SELECT id,title,COALESCE(volume,'') volume,kind,sort_order"
            " FROM books ORDER BY sort_order"
        )
    )

    rows: list[dict] = []
    books: list[dict] = []

    for b in books_meta:
        bid = b["id"]
        picked = list(
            con.execute(
                "SELECT id,word,phonetic,pos,meaning,is_phrase,marker,unit_no,page"
                " FROM entries WHERE book_id=? AND unit_no<=?"
                " ORDER BY unit_no, seq, id LIMIT ?",
                (bid, UNITS_PER_BOOK, PER_BOOK),
            )
        )
        if not picked:
            continue

        for e in picked:
            eid = e["id"]
            senses = [
                {"source": r[0], "pos": r[1], "zh": r[2]}
                for r in con.execute(
                    "SELECT source,pos,zh FROM senses WHERE entry_id=? ORDER BY id", (eid,)
                )
            ]
            examples = [
                {"en": r[0], "zh": r[1], "source": r[2], "label": r[3]}
                for r in con.execute(
                    "SELECT en,zh,source,label FROM examples WHERE entry_id=? LIMIT 2", (eid,)
                )
            ]
            rows.append(
                {
                    "book_id": bid,
                    "word": e["word"],
                    "phonetic": e["phonetic"],
                    "pos": e["pos"],
                    "meaning": e["meaning"],
                    "is_phrase": e["is_phrase"] == 1,
                    "marker": e["marker"],
                    "unit_no": e["unit_no"],
                    "page": e["page"],
                    "book": b["volume"] or b["title"],
                    "senses": senses,
                    "examples": examples,
                }
            )

        # 元数据全部由「实际导出的这些词条」统计，保证和上面的 rows 一致
        units = Counter(r["unit_no"] for r in rows if r["book_id"] == bid)
        pages = Counter(r["page"] for r in rows if r["book_id"] == bid and r["page"] is not None)
        initials = Counter(r["word"][:1].lower() for r in rows if r["book_id"] == bid)
        markers = Counter(r["marker"] for r in rows if r["book_id"] == bid)
        with_ex = len({r["word"].lower() for r in rows if r["book_id"] == bid and r["examples"]})

        books.append(
            {
                "id": bid,
                "title": b["title"],
                "volume": b["volume"],
                "kind": b["kind"],
                "sort_order": b["sort_order"],
                "total": sum(units.values()),
                "units": [{"key": str(k), "count": v} for k, v in sorted(units.items())],
                "pages": [{"key": str(k), "count": v} for k, v in sorted(pages.items())],
                "initials": [{"key": k, "count": v} for k, v in sorted(initials.items())],
                "markers": dict(markers),
                "sources": {"textbook": sum(units.values())},
                "with_examples": with_ex,
            }
        )

    payload = {"books": books, "entries": rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// 由 scripts/export_mock.py 生成，仅供纯前端预览使用。\n"
        "// 真实应用里这些数据来自 SQLite，不走这个文件。\n"
        "export const MOCK = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + " as const;\n",
        encoding="utf-8",
    )
    print(
        f"{OUT}: {len(books)} 本书, {len(rows)} 条词条, {OUT.stat().st_size / 1024:.0f} KB",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
