#!/usr/bin/env node
/**
 * 打一个「双击就能打开」的单文件预览版。
 *
 * 为什么需要它：手机浏览器用 file:// 打开普通 Vite 产物会白屏 ——
 * module 脚本被 CORS 拦、CSS 是外链、Tauri 的 invoke 也不存在。
 * 这里把 JS / CSS / 图标全部内联进一个 index.html，并改用 IIFE 格式；
 * 数据由 src/lib/api.ts 在缺少 Tauri 时回落到 mock 数据。
 *
 * 用法：node scripts/build_preview.mjs [输出目录]
 */
import { build } from "vite";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.argv[2] || "/storage/emulated/0/用户/易词预览";
const distDir = "dist-preview";
const ICON_SRC = "public/icon.png";
/** 内联用的图标边长。首页显示 96px，192 足够 2x 屏，体积也小 */
const ICON_SIZE = 192;

await build({ mode: "preview" });

const files = await readdir(distDir);
const jsName = files.find((f) => f.endsWith(".js"));
const cssName = files.find((f) => f.endsWith(".css"));
if (!jsName) throw new Error("没有找到构建产物 JS");

let html = await readFile(path.join(distDir, "index.html"), "utf8");
const js = await readFile(path.join(distDir, jsName), "utf8");
const css = cssName ? await readFile(path.join(distDir, cssName), "utf8") : "";

/** 用 sharp 太重，这里直接调用系统 magick 压到目标尺寸再 base64 */
async function iconDataUri() {
  const { execFileSync } = await import("node:child_process");
  const tmp = path.join(OUT_DIR, ".icon.png");
  await mkdir(OUT_DIR, { recursive: true });
  try {
    execFileSync("magick", [ICON_SRC, "-resize", `${ICON_SIZE}x${ICON_SIZE}`, tmp]);
    const buf = await readFile(tmp);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // 没有 magick 就直接用原图，体积大一点但不影响正确性
    const buf = await readFile(ICON_SRC);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(tmp, { force: true });
  }
}

const icon = await iconDataUri();

// 内联 CSS / JS。必须用函数形式做替换：字符串形式里 $& $' $` 会被
// 当成替换模式，而 bundle 里恰好含有这些字符，会把代码替换坏。
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*>/g,
  () => (css ? `<style>\n${css}\n</style>` : ""),
);
// 先把外链 script 摘掉。不能原地内联：内联脚本是同步执行的，
// 放在 <head> 里跑时 <div id="root"> 还没解析出来（React 会报 #299）。
html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, () => "");
// 再插到 </body> 前，此时 DOM 已经就绪。
html = html.replace("</body>", () => `<script>\n${js}\n</script>\n  </body>`);

// 图片也内联：用户可能只把 index.html 单独拷到手机上
html = html.replace(/(src=")\.?\/?icon\.png(")/g, (_m, a, b) => `${a}${icon}${b}`);
// bundle 里的字符串常量也要换掉。React 是在运行时创建 <img> 的，
// 只改 HTML 里的 src 属性没用，得连 JS 里的 "/icon.png" 一起替换。
html = html.replace(/(["'`])(?:\.\/|\/)?icon\.png\1/g, () => JSON.stringify(icon));

// 校验：把 JS 正文剥掉再找外链。bundle 里本身就含有
// "<script ... src=...>" 这样的字符串（某库内嵌的模板），不剥会误报。
const skeleton = html.replace(js, "");
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(skeleton)) {
  throw new Error("仍有外部资源未被内联，预览版可能白屏");
}
if (/<img[^>]+src="(?!data:)/.test(skeleton)) {
  throw new Error("仍有外部图片未被内联");
}
if (!html.includes("<style>") || !html.includes("<script>")) {
  throw new Error("内联似乎没有生效");
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  path.join(OUT_DIR, "index.html"),
  html.replace("<head>", '<head>\n    <meta name="color-scheme" content="light dark" />'),
  "utf8",
);

const bytes = (await readFile(path.join(OUT_DIR, "index.html"))).length;
console.log(`单文件预览 → ${path.join(OUT_DIR, "index.html")} (${(bytes / 1024).toFixed(0)} KB)`);
