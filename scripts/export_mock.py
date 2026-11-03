#!/usr/bin/env python3
"""从种子库导出一份精简数据，供纯前端预览用。

手机上直接打开 HTML 时没有 Rust 后端，界面要靠这份数据渲染。
只取每本书 UNIT 1 的前若干条，够看清筛选、预览、题型效果即可。

用法：python3 scripts/export_mock.py
输出：src/lib/mock-data.ts
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "src-tauri/resources/seed.sqlite"
OUT = ROOT / "src/lib/mock-data.ts"

PER_BOOK = 48


def main() -> int:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    books = []
    for b in con.execute(
        "SELECT id,title,COALESCE(volume,'') volume,kind,sort_order FROM books ORDER BY sort_order"
    ):
        bid = b["id"]
        total = con.execute("SELECT COUNT(*) FROM entries WHERE book_id=?", (bid,)).fetchone()[0]
        units = [
            {"key": str(r[0]), "count": r[1]}
            for r in con.execute(
                "SELECT unit_no, COUNT(*) FROM entries WHERE book_id=? GROUP BY unit_no ORDER BY unit_no",
                (bid,),
            )
        ]
        pages = [
            {"key": str(r[0]), "count": r[1]}
            for r in con.execute(
                "SELECT page, COUNT(*) FROM entries WHERE book_id=? AND page IS NOT NULL"
                " GROUP BY page ORDER BY page",
                (bid,),
            )
        ]
        initials = [
            {"key": r[0], "count": r[1]}
            for r in con.execute(
                "SELECT initial, COUNT(*) FROM entries WHERE book_id=? GROUP BY initial ORDER BY initial",
                (bid,),
            )
        ]
        markers = {
            r[0]: r[1]
            for r in con.execute(
                "SELECT marker, COUNT(*) FROM entries WHERE book_id=? GROUP BY marker", (bid,)
            )
        }
        sources = {
            r[0]: r[1]
            for r in con.execute(
                "SELECT source_kind, COUNT(*) FROM entries WHERE book_id=? GROUP BY source_kind",
                (bid,),
            )
        }
        with_ex = con.execute(
            "SELECT COUNT(DISTINCT e.id) FROM entries e JOIN examples x ON x.entry_id=e.id"
            " WHERE e.book_id=?",
            (bid,),
        ).fetchone()[0]
        books.append(
            {
                "id": bid,
                "title": b["title"],
                "volume": b["volume"],
                "kind": b["kind"],
                "sort_order": b["sort_order"],
                "total": total,
                "units": units,
                "pages": pages,
                "initials": initials,
                "markers": markers,
                "sources": sources,
                "with_examples": with_ex,
            }
        )

    rows = []
    for b in books:
        for e in con.execute(
            "SELECT id,word,phonetic,pos,meaning,is_phrase,marker,unit_no,page"
            " FROM entries WHERE book_id=? AND unit_no=1 ORDER BY seq, id LIMIT ?",
            (b["id"], PER_BOOK),
        ):
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
                    "book_id": b["id"],
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
        f"{OUT}: {len(books)} 本书, {len(rows)} 条词条, {OUT.stat().st_size/1024:.0f} KB",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
