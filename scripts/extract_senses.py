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


# 中文标点：截断英文释义时要保留它们
CN_PUNCT = "（）()【】〔〕［］《》〈〉「」『』、，。；：？！…—·"


def clean_zh(text: str) -> str:
    """去掉词典里的英文残留与多余空白，保留完整的中文释义（含括号）。

    之前的写法是「从第一个汉字开始截」，会把开头的左括号吃掉：
    `（尤指已退休）年纪大的，老年的` 变成 `尤指已退休）年纪大的，老年的`，
    全库有 655 条这样括号不配对。现在只截真正的英文片段。
    """
    text = text.replace("\u3000", " ").strip()

    m = CJK_RE.search(text)
    if m and m.start() > 0:
        # 汉字之前如果有英文，才截断；但要把紧挨着汉字的括号等标点留下
        head = text[: m.start()]
        keep = ""
        for ch in reversed(head):
            if ch in CN_PUNCT or ch.isspace():
                keep = ch + keep
            else:
                break
        text = keep + text[m.start():]

    text = re.sub(r"\s+", " ", text)
    text = text.strip(" ；，,。、\t")
    return fix_parens(text)


def fix_parens(text: str) -> str:
    """统一括号并去掉孤立括号。

    词典原文把半角 ( 和全角 ）混着用（`(计划或建议的）筹划者`），
    这是 HTML 里括号与标签交错的产物。全部折成全角，
    实在配不上的孤立括号直接删掉 —— 留着比删掉更难看。
    """
    t = text.replace("(", "（").replace(")", "）")
    depth = 0
    out = []
    for ch in t:
        if ch == "（":
            depth += 1
            out.append(ch)
        elif ch == "）":
            if depth > 0:
                depth -= 1
                out.append(ch)
            # depth 为 0 说明是孤立右括号，丢掉
        else:
            out.append(ch)
    # 还有没闭合的左括号，从后往前删掉
    while depth > 0:
        idx = "".join(out).rfind("（")
        if idx < 0:
            break
        out.pop(idx)
        depth -= 1
    return "".join(out).strip()


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


def balanced_span(page: str, start: int) -> str:
    """从 start（指向 <span 的位置）取出一整个配平的 span 内容。

    正则数不清嵌套的 </span>，而柯林斯的释义块恰好是
    <span class="def_cn">(<span class="chinese-text">甲</span>)<span ...>乙</span></span>，
    用非贪婪正则会截在第一个 </span> 上。这里数标签深度。
    """
    open_tag = page.index(">", start) + 1
    depth = 1
    i = open_tag
    while i < len(page) and depth > 0:
        nxt_open = page.find("<span", i)
        nxt_close = page.find("</span>", i)
        if nxt_close < 0:
            break
        if 0 <= nxt_open < nxt_close:
            depth += 1
            i = nxt_open + 5
        else:
            depth -= 1
            if depth == 0:
                return page[open_tag:nxt_close]
            i = nxt_close + 7
    return page[open_tag:]


def collins(page: str) -> list[tuple[str, str]]:
    """柯林斯：一个释义被拆在多个 <span class="chinese-text"> 里。

    真实结构是：
      <span class="def_cn">(<span class="chinese-text">在组织或专业领域中</span>)
      <span class="chinese-text">级别高的，资深的</span></span>

    之前把每个 chinese-text 单独当一条，于是「在组织或专业领域中」
    和「级别高的，资深的」被存成两条碎片。现在按 def_cn 整块取出，
    剥掉标签后括号也自然复原。
    """
    out = []
    seen: set[str] = set()
    for m in re.finditer(r'<span class="def_cn[^"]*"', page):
        block = balanced_span(page, m.start())
        zh = clean_zh(strip(block))
        if not zh or not CJK_RE.search(zh) or len(zh) > 60:
            continue
        if zh in seen:
            continue
        seen.add(zh)
        out.append(("", zh))
        if len(out) >= 3:
            break
    return out


def oxford_bilingual(page: str) -> list[tuple[str, str]]:
    """同义词词典：先找 class="cn" 的真释义，没有再用 class="zm" 的概念词。

    这本本质是反查/同义词词典，抓到的常是「大」「老」「上级」这种碎片。
    三个汉字以下的直接丢掉 —— 它们放在笔记里对理解词义没有帮助，
    反而把版面撑得很乱。
    """
    out = []
    for m in re.finditer(r'<span class="cn">(.*?)</span>', page, re.S):
        zh = clean_zh(strip(m.group(1)))
        if zh and len(zh) >= 3 and CJK_RE.search(zh):
            out.append(("", zh))
    if not out:
        m = re.search(r'<div class="zm">(.*?)</div>', page, re.S)
        if m:
            zh = clean_zh(strip(m.group(1)))
            if zh and len(zh) >= 3 and CJK_RE.search(zh):
                out.append(("", zh))
    return out


def looks_broken(zh: str) -> bool:
    """明显的残片：只有一个「的」开头且整体很短，或只剩标点。

    注意不要用「长度 <= 2」当判据 —— 「蝴蝶」「昆虫」这种短释义是完整的。
    """
    stripped = zh.strip("（）;；,， 、")
    if not stripped:
        return True
    if stripped.startswith("的") and len(stripped) <= 4:
        return True
    # 全部是标点/单字虚词
    if len(stripped) <= 1 and stripped in "的之了是在有和与":
        return True
    return False


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
                if zh in seen or looks_broken(zh):
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
