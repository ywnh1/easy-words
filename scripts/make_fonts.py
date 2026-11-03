#!/usr/bin/env python3
"""生成 PDF 用的子集字体。

分两套，因为没有任何一个系统字体能同时覆盖汉字和音标：

  zh.ttf         Droid Sans Fallback（TrueType）—— 汉字 + 中文标点
  latin.ttf      DejaVu Sans（TrueType）        —— 拉丁字母、数字、IPA 音标
  latin-bold.ttf DejaVu Sans Bold               —— 同上，粗体

为什么不用 Noto Sans CJK：它是 OTF/CFF 轮廓，printpdf 写出的 CID 字体
映射会错位，页面上画出完全不相干的汉字（文本层却是对的）。TrueType 的
glyf 轮廓没有这个问题。Droid 只有汉字没有拉丁，所以拉丁另配 DejaVu。

子集范围直接从 data/ 里的 TSV 抓取，词库加了新内容重跑一次即可，不会缺字。
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri/assets/fonts"

ZH_SRC = "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"
LATIN_SRC = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
LATIN_BOLD_SRC = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# 版面上会用到、但不一定出现在词库里的字符
ALWAYS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "　，。、；：？！“”‘’（）《》〈〉【】〔〕—…·～￥％＋－×÷＝／＼"
    + "•·●○★☆※→←↑↓■□▲△◆◇§¶†‡±≈≠≤≥∞°′″"
    + "ɜːˈˌʃʒθðŋɒʌəɪʊæɑɔɡʤʧɚɝɾʔ"
)


def harvest() -> str:
    """把词库、短语、例句里出现过的字符全部收进来。"""
    chars = set(ALWAYS)
    for pattern in ("data/books/*.tsv", "data/phrases/*.tsv", "data/examples/*.tsv"):
        for p in sorted(ROOT.glob(pattern)):
            chars.update(p.read_text(encoding="utf-8"))
    for junk in "\n\r\t":
        chars.discard(junk)
    return "".join(sorted(chars))


def run(src: str, dst: Path, text_file: Path) -> None:
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", src,
            f"--output-file={dst}",
            f"--text-file={text_file}",
            "--layout-features=*",
            "--drop-tables+=DSIG",
            "--no-hinting",
        ],
        check=True,
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    chars = harvest()
    tmp = OUT / ".charset.txt"
    tmp.write_text(chars, encoding="utf-8")
    print(f"字符数：{len(chars)}", file=sys.stderr)

    run(ZH_SRC, OUT / "zh.ttf", tmp)
    run(LATIN_SRC, OUT / "latin.ttf", tmp)
    run(LATIN_BOLD_SRC, OUT / "latin-bold.ttf", tmp)
    tmp.unlink()

    total = 0
    for f in sorted(OUT.glob("*.ttf")):
        kb = f.stat().st_size / 1024
        total += kb
        print(f"{f.name}\t{kb:.0f} KB", file=sys.stderr)
    print(f"合计 {total:.0f} KB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
