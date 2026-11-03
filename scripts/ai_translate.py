#!/usr/bin/env python3
"""把 AI 翻译结果并入词库，作为「AI 翻译」这个中文来源。

这个脚本只负责**格式与合并**，不调用任何模型 —— 界面上那个来源要真正有值，
得有实际译文填进来。两条路：

  A. 你自己（或别的工具）产出译文，写进 data/senses/ai.tsv：
         # word<TAB>source<TAB>pos<TAB>zh
         mood	ai		n. 心情；情绪
         amusement park	ai		n. 游乐场

  B. 我按你指定的服务去调（需要你给服务商、模型名、密钥怎么放），
     批量跑一次写进同一个文件。

用法：
  python3 scripts/ai_translate.py --dry-run      # 看还缺哪些词
  python3 scripts/ai_translate.py --import FILE  # 把外部译文并入 ai.tsv
  python3 scripts/ai_translate.py --stats        # 统计覆盖率
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "src-tauri/resources/seed.sqlite"
AI_TSV = ROOT / "data/senses/ai.tsv"
HEADER = "# word\tsource\tpos\tzh\n"


def read_tsv(path: Path) -> list[list[str]]:
    rows = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rows.append(line.split("\t"))
    return rows


def existing() -> dict[str, str]:
    out: dict[str, str] = {}
    for row in read_tsv(AI_TSV):
        if len(row) >= 4 and row[3].strip():
            out[row[0].strip().lower()] = row[3].strip()
    return out


def all_words() -> list[str]:
    con = sqlite3.connect(DB)
    v = [r[0] for r in con.execute("SELECT DISTINCT word_lower FROM entries ORDER BY word_lower")]
    con.close()
    return v


def stats() -> int:
    words = all_words()
    have = existing()
    missing = [w for w in words if w not in have]
    covered = len(words) - len(missing)
    print(f"词条 {len(words)} 条，已有 AI 译文 {covered} 条", file=sys.stderr)
    if missing:
        print(f"仍缺 {len(missing)} 条，前 20：{'，'.join(missing[:20])}", file=sys.stderr)
    return 0


def dry_run() -> int:
    words = all_words()
    have = existing()
    missing = [w for w in words if w not in have]
    print(f"将翻译 {len(missing)} 条")
    for w in missing:
        print(w)
    return 0


def do_import(path: Path) -> int:
    incoming = read_tsv(path)
    merged = existing()
    added = 0
    for row in incoming:
        if len(row) < 2:
            continue
        # 接受 2 列（word, zh）或 4 列（word, source, pos, zh）
        if len(row) >= 4:
            word, zh = row[0].strip(), row[3].strip()
        else:
            word, zh = row[0].strip(), row[1].strip()
        if not word or not zh:
            continue
        if merged.get(word.lower()) == zh:
            continue
        merged[word.lower()] = zh
        added += 1

    AI_TSV.parent.mkdir(parents=True, exist_ok=True)
    lines = [HEADER.rstrip("\n")]
    for word in sorted(merged):
        lines.append(f"{word}\tai\t\t{merged[word]}")
    AI_TSV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"并入 {added} 条，ai.tsv 现有 {len(merged)} 条 → {AI_TSV}", file=sys.stderr)
    print("记得重跑 scripts/build_db.py 让词库生效", file=sys.stderr)
    return 0


def self_test() -> int:
    """用临时文件跑一遍「导入 → 合并 → 去重」，不碰真实的 ai.tsv。"""
    import tempfile

    global AI_TSV
    real = AI_TSV
    with tempfile.TemporaryDirectory() as tmp:
        AI_TSV = Path(tmp) / "ai.tsv"
        src = Path(tmp) / "in.tsv"
        src.write_text("mood\t心情\ntestword\t测试词\nmood\t心情\n", encoding="utf-8")
        do_import(src)

        rows = read_tsv(AI_TSV)
        assert len(rows) == 2, f"应合并成 2 条（去重后），实际 {len(rows)}: {rows}"
        assert ("mood", "ai", "", "心情") in [tuple(r) for r in rows], rows

        # 再导入一次，内容相同则不应增加
        do_import(src)
        assert len(read_tsv(AI_TSV)) == 2, "重复导入不应增加条目"

        # 2 列与 4 列格式都接受
        src.write_text("smile\tai\t\t微笑\n", encoding="utf-8")
        do_import(src)
        got = {r[0]: r[3] for r in read_tsv(AI_TSV)}
        assert got.get("smile") == "微笑", got

    AI_TSV = real
    print("✓ ai_translate 自检通过")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="列出还缺译文的词")
    ap.add_argument("--import", dest="import_file", help="把外部译文并入 ai.tsv")
    ap.add_argument("--stats", action="store_true", help="覆盖率统计")
    ap.add_argument("--self-test", action="store_true", help="跑内置自检，不碰真实文件")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if args.import_file:
        return do_import(Path(args.import_file))
    if args.dry_run:
        return dry_run()
    return stats()


if __name__ == "__main__":
    raise SystemExit(main())
