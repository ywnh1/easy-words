#!/usr/bin/env python3
"""把本地插件挂到 Tauri 的 Android 工程里。

Tauri 只自动注册「来自 crates.io 的插件」，本地 path 插件需要两步：

  1. Cargo.toml 里加 path 依赖（这个脚本会检查并提示）
  2. gen/android/settings.gradle 里 include 插件的 android 工程，
     并在 app/build.gradle.kts 的 dependencies 里加 project 依赖

第 2 步每次 `tauri android init` 都会重置，所以必须在 init 之后跑。

用法：python3 scripts/link-android-plugins.py src-tauri/gen/android
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PLUGINS = [
    # (gradle 模块名, 相对 gen/android 的路径)
    ("tauri-plugin-save-share", "../../plugins/save-share/android"),
]


def patch_settings(gen: Path) -> bool:
    path = gen / "settings.gradle"
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    changed = False
    for name, rel in PLUGINS:
        if name in text:
            continue
        # Tauri 生成的 settings.gradle 用 include ':tauri-android'
        # 这种 Groovy 语法，追加在同一种位置
        text = text.rstrip("\n") + f'\ninclude ":{name}"\n'
        text += f'project(":{name}").projectDir = new File(rootDir, "{rel}")\n'
        changed = True
    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def patch_app_gradle(gen: Path) -> bool:
    path = gen / "app/build.gradle.kts"
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    changed = False
    for name, _ in PLUGINS:
        dep = f'    implementation(project(":{name}"))'
        if dep in text:
            continue
        # 塞进 dependencies { } 块里
        m = re.search(r"\ndependencies\s*\{", text)
        if not m:
            return False
        text = text[: m.end()] + "\n" + dep + text[m.end():]
        changed = True
    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def main() -> int:
    gen = Path(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/gen/android")
    if not gen.exists():
        print(f"找不到 {gen}，先跑 tauri android init", file=sys.stderr)
        return 1

    a = patch_settings(gen)
    b = patch_app_gradle(gen)

    # 校验：两个文件里都要能看到插件名
    ok = True
    for f in ("settings.gradle", "app/build.gradle.kts"):
        text = (gen / f).read_text(encoding="utf-8")
        if "tauri-plugin-save-share" not in text:
            print(f"× {f} 里没有插件引用", file=sys.stderr)
            ok = False
    if not ok:
        return 1

    print(f"✓ settings.gradle {'已更新' if a else '已是最新'}")
    print(f"✓ app/build.gradle.kts {'已更新' if b else '已是最新'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
