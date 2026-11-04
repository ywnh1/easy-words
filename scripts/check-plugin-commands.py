#!/usr/bin/env python3
"""检查本地插件的命令名在 Rust 与 Kotlin 两侧是否一致。

Tauri 在 Android 上是按 **Kotlin 方法名** 分发命令的：
Rust 调 run_mobile_plugin("save_file") 时，插件里必须有
fun save_file(invoke: Invoke)。

这类错误在桌面上完全测不出来（那段代码在 #[cfg(target_os = "android")] 里），
只有在手机上点导出时才暴露，而且报错信息只说"命令找不到"，
不会告诉你是大小写/下划线的问题。所以用脚本盯住。

用法：python3 scripts/check-plugin-commands.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "src-tauri/plugins/save-share"


def rust_commands() -> set[str]:
    """Rust 侧 run_mobile_plugin 里用到的命令名"""
    src = (PLUGIN / "src/lib.rs").read_text(encoding="utf-8")
    return set(re.findall(r'run_mobile_plugin::<[^>]*>\(\s*"([^"]+)"', src))


def kotlin_commands() -> set[str]:
    """Kotlin 侧带 @Command 注解的方法名"""
    found: set[str] = set()
    for kt in PLUGIN.glob("android/src/main/java/**/*.kt"):
        text = kt.read_text(encoding="utf-8")
        # 匹配 "@Command" 后面紧跟的 fun xxx(
        found |= set(re.findall(r"@Command\s+(?:override\s+)?fun\s+(\w+)\s*\(", text))
    return found


def declared_commands() -> set[str]:
    """build.rs 里声明的命令名（用于生成权限）"""
    src = (PLUGIN / "build.rs").read_text(encoding="utf-8")
    m = re.search(r"COMMANDS:\s*&\[&str\]\s*=\s*&\[([^\]]*)\]", src)
    if not m:
        return set()
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def main() -> int:
    rust = rust_commands()
    kt = kotlin_commands()
    declared = declared_commands()

    problems = []

    if not rust:
        problems.append("Rust 侧没找到任何 run_mobile_plugin 调用")
    if not kt:
        problems.append("Kotlin 侧没找到任何 @Command 方法")

    # 1) Rust 调用的每个命令，Kotlin 都必须有
    missing = rust - kt
    if missing:
        problems.append(
            f"Rust 调用了但 Kotlin 没有对应方法：{sorted(missing)}\n"
            f"    Kotlin 注册的是：{sorted(kt)}"
        )

    # 2) build.rs 声明的命令，Rust 也要用
    stale = declared - rust
    if stale:
        problems.append(f"build.rs 声明了但 Rust 没调用：{sorted(stale)}")

    # 3) 反向：Kotlin 有但 Rust 从不调，属于死代码，提醒但不阻断
    unused = kt - rust

    if problems:
        print("✗ 插件命令名不一致：", file=sys.stderr)
        for p in problems:
            print("  -", p, file=sys.stderr)
        return 1

    print(f"✓ 命令名一致：{sorted(rust)}")
    if unused:
        print(f"  （Kotlin 里未被 Rust 调用的方法：{sorted(unused)}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
