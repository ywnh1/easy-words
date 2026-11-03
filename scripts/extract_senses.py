#!/usr/bin/env python3
"""从三本词典抽取中文释义，按来源写入 TSV。

三个来源的实际情况：
  oxford_high       牛津高阶（英汉双解）—— 标准释义，在 <chn> 里，质量最好
  collins           柯林斯 COBUILD       —— 标准释义，在 class="chinese-text" 里
  oxford_bilingual  牛津高阶英汉双解词典 —— 实为同义词/反查词典，
                    优先取 class="cn" 的真释义，没有才退回 class="zm" 的概念词，
                    噪声较大，建议在应用里把它的优先级排在最后

用法：python3 scripts/extract_senses.py
输出：data/senses/senses.tsv  (word \t source \t pos \t zh)
"""
from __future__ import annotations

import html
import os
import re
import sys
from pathlib import Path

from mdict_utils.base.readmdict import MDX

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/senses/senses.tsv"

LEXICON = {
    "oxford_high": "/storage/emulated/0/Download/mdict/牛津英汉双解/牛津高阶.mdx",
    "collins": "/storage/emulated/0/Download/mdict/柯林斯CollinsCOBUILDOverhaul/CollinsCOBUILDOverhaul.mdx",
    "oxford_bilingual": "/storage/emulated/0/Download/mdict/牛津高阶英汉双解词典/牛津高阶英汉双解词典.mdx",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def strip(fragment: str) -> str:
    fragment = re.sub(r"<[^>]*>", "", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def clean_zh(text: str) -> str:
    """去掉词典里的音标残留和多余空白，只保留中文释义部分。"""
    text = text.replace("\u3000", " ").strip()
    # 有些条目把英文释义也塞进来，按第一个汉字位置裁掉前面的英文
    m = CJK_RE.search(text)
    if m and m.start() > 0:
        text = text[m.start():]
    return re.sub(r"\s+", " ", text).strip(" ；，,。")


def targets() -> set[str]:
    """所有需要释义的词条（教材词表 + 扩充短语）。"""
    want: set[str] = set()
    for pattern in ("data/books/*.tsv", "data/phrases/*.tsv"):
        for p in sorted(ROOT.glob(pattern)):
            for line in p.read_text(encoding="utf-8").splitlines():
                if not line.strip() or line.startswith("#"):
                    continue
                cols = line.split("\t")
                word = cols[2] if "books" in str(p) else (cols[1] if len(cols) > 1 else "")
                word = word.strip()
                if word:
                    want.add(word.lower())
    return want


def oxford_high(page: str) -> list[tuple[str, str]]:
    """牛津高阶：只取词条释义 <defT><chn>，不要例句译文 <xT><chn>。"""
    out = []
    for m in re.finditer(r"<defT>\s*<chn>(.*?)</chn>", page, re.S):
        zh = clean_zh(strip(m.group(1)))
        if zh and CJK_RE.search(zh) and len(zh) <= 40:
            out.append(("", zh))
    # 词性单独再扫一遍，取第一个就够，用来给释义配词性
    pos_m = re.search(r'<span class="pos"[^>]*>([^<]*)</span>', page)
    pos = pos_m.group(1).strip() if pos_m else ""
    return [(pos, zh) for _, zh in out]


def collins(page: str) -> list[tuple[str, str]]:
    """柯林斯：释义在 <p><span class="chinese-text">，只取前两条且不超过 40 字。"""
    out = []
    for m in re.finditer(r'<span class="chinese-text">(.*?)</span>', page, re.S):
        zh = clean_zh(strip(m.group(1)))
        if zh and CJK_RE.search(zh) and len(zh) <= 40:
            out.append(("", zh))
        if len(out) >= 2:
            break
    return out


def oxford_bilingual(page: str) -> list[tuple[str, str]]:
    """同义词词典：先找 class="cn" 的真释义，没有再用 class="zm" 的概念词。"""
    out = []
    for m in re.finditer(r'<span class="cn">(.*?)</span>', page, re.S):
        zh = clean_zh(strip(m.group(1)))
        if zh and CJK_RE.search(zh):
            out.append(("", zh))
    if not out:
        m = re.search(r'<div class="zm">(.*?)</div>', page, re.S)
        if m:
            zh = clean_zh(strip(m.group(1)))
            if zh and CJK_RE.search(zh):
                out.append(("", zh))
    return out


EXTRACTORS = {
    "oxford_high": oxford_high,
    "collins": collins,
    "oxford_bilingual": oxford_bilingual,
}


def main() -> int:
    want = targets()
    print(f"目标 {len(want)} 条", file=sys.stderr)

    rows: list[tuple[str, str, str, str]] = []
    for source, path in LEXICON.items():
        if not os.path.exists(path):
            print(f"跳过缺失词典 {source}", file=sys.stderr)
            continue
        print(f"扫描 {source} …", file=sys.stderr)
        extract = EXTRACTORS[source]
        hits = 0
        for key, value in MDX(path).items():
            try:
                head = key.decode("utf-8").strip().lower()
            except UnicodeDecodeError:
                continue
            if head not in want:
                continue
            page = value.decode("utf-8", "replace")
            if page.startswith("@@@LINK="):
                continue
            # 每个词在同一来源里只留前 3 个义项，够用且不至于太长
            seen: set[str] = set()
            for pos, zh in extract(page)[:3]:
                if zh in seen:
                    continue
                seen.add(zh)
                rows.append((head, source, pos, zh))
                hits += 1
        print(f"  {source}: {hits} 条释义", file=sys.stderr)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        f.write("# word\tsource\tpos\tzh\n")
        for r in rows:
            f.write("\t".join(r) + "\n")
    print(f"写入 {len(rows)} 条 → {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
