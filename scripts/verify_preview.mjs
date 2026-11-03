#!/usr/bin/env node
/**
 * 在 jsdom 里真实跑一遍预览版 HTML，确认它能渲染出界面而不是白屏。
 *
 * 检查：
 *   1. #root 里有实际内容
 *   2. 出现教材名、题型名等关键文案
 *   3. 没有向外请求资源（file:// 下会失败）
 *   4. 没有未捕获的运行时错误
 *
 * 用法：node scripts/verify_preview.mjs [html 路径]
 */
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const file = process.argv[2] || "/storage/emulated/0/用户/易词预览/index.html";
const html = await readFile(file, "utf8");

const errors = [];
const external = [];

const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));
vc.on("error", (...a) => errors.push(a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "file:///preview/index.html",
  virtualConsole: vc,
  resources: {
    // 任何外部请求都记下来；预览版不该有
    fetch(url) {
      external.push(url);
    },
  },
});

// React 在微任务里渲染，给几轮事件循环
await new Promise((r) => setTimeout(r, 800));

const root = dom.window.document.getElementById("root");
const text = root?.textContent ?? "";
const problems = [];

if (!root) problems.push("找不到 #root");
else if (text.trim().length < 50) problems.push(`#root 几乎是空的（${text.length} 字），可能白屏`);

for (const want of ["必修第一册", "四选 n", "句子默写", "笔记模式", "界面预览版"]) {
  if (!text.includes(want)) problems.push(`缺少预期文案：${want}`);
}

// mock 数据要真的进来了
if (!text.includes("senior")) problems.push("预览词条没有渲染出来（未找到 senior）");

if (external.length) problems.push(`发生了外部资源请求：${external.join(", ")}`);
if (errors.length) problems.push(`运行时错误：${errors.slice(0, 3).join(" | ")}`);

const realErrors = errors.filter(
  (e) => !/Could not parse CSS stylesheet|Not implemented: window\./.test(e),
);

if (problems.length) {
  console.error("✗ 预览版存在问题：");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

// ---- 交互链路：点按钮 → React 状态变化 → 重新渲染 ----
const doc = dom.window.document;
const clickByText = async (sel, label, wait = 500) => {
  const el = [...doc.querySelectorAll(sel)].find((n) => n.textContent?.trim() === label);
  if (!el) return false;
  el.click();
  await new Promise((r) => setTimeout(r, wait));
  return true;
};

const rootText = () => doc.getElementById("root")?.textContent ?? "";

const steps = [];
if (!(await clickByText("button", "笔记模式"))) steps.push("找不到「笔记模式」按钮");
else if (!rootText().includes("例句来源")) steps.push("切到笔记模式后没有出现「例句来源」设置");

if (!(await clickByText("button", "随机"))) steps.push("找不到「随机」按钮");
else if (!rootText().includes("换一批")) steps.push("切到随机后没有出现「换一批」");

// 换一批应当换掉预览里的词
const before = rootText().slice(-800);
if (await clickByText("button", "换一批", 700)) {
  const after = rootText().slice(-800);
  if (before === after) steps.push("点「换一批」后预览没有变化");
} else {
  steps.push("找不到「换一批」按钮");
}

if (steps.length) {
  console.error("✗ 交互有问题：");
  for (const p of steps) console.error("  -", p);
  process.exit(1);
}

console.log("✓ 预览版渲染与交互均正常");
console.log(`  #root 文本 ${text.length} 字，示例：${text.slice(0, 60).replace(/\s+/g, " ")}…`);
if (realErrors.length) console.log("  （忽略的警告：", realErrors.slice(0, 2).join(" | "), "）");
