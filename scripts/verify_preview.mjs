#!/usr/bin/env node
/**
 * 在 jsdom 里真实跑一遍预览版 HTML，确认能渲染、能点。
 *
 * 覆盖：首页两个入口 → 向导逐步前进 → 问号弹窗 → 关于页。
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
    fetch(url) {
      external.push(url);
    },
  },
});

// Mantine 的 colorScheme="auto" 会问 matchMedia，jsdom 没有实现
dom.window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});

// Mantine 的部分组件（ScrollArea 等）依赖这两个浏览器 API
dom.window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
dom.window.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// 向导切步会调 scrollTo 回到顶部。jsdom 有这个方法但会抛 not-implemented，
// 所以直接覆盖，不能只补 undefined 的情况。
dom.window.scrollTo = () => {};

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
await wait(900);

const doc = dom.window.document;
// 注意：内联的 <script> 也在 body 里，它的源码含有界面上会出现的字符串
// （比如组件里写死的「待填写」），直接取 textContent 会误判。
const bodyText = () => {
  const c = doc.body.cloneNode(true);
  c.querySelectorAll("style,script").forEach((n) => n.remove());
  return c.textContent ?? "";
};

const problems = [];
/** 记录实测到的规模，输出里带出来，方便判断断言是不是空跑 */
const marks = { tiles: 0 };
const clickText = async (label, sel = "button") => {
  const el = [...doc.querySelectorAll(sel)].find(
    (n) => n.textContent?.trim() === label || n.getAttribute("aria-label") === label,
  );
  if (!el) return false;
  el.click();
  await wait();
  return true;
};
const expect = (cond, msg) => {
  if (!cond) problems.push(msg);
};

// ---------- 首页 ----------
expect(bodyText().includes("Easy Words"), "首页没有标题");
expect(bodyText().includes("开始出题"), "首页缺少「开始出题」按钮");
expect(bodyText().includes("关于"), "首页缺少「关于」按钮");

// ---------- 关于页 ----------
if (await clickText("关于")) {
  const t = bodyText();
  expect(t.includes("版本"), "关于页缺少版本号");
  expect(/v\d+\.\d+\.\d+/.test(t), "关于页没有具体版本号");
  expect(t.includes("MIT"), "关于页缺少开源协议");
  expect(t.includes("源代码"), "关于页缺少仓库地址一栏");
  expect(t.includes("问题反馈"), "关于页缺少 issue 地址一栏");
  // 仓库地址填上之后，应该是可点的链接而不是「待填写」
  const links = [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute("href") ?? "");
  expect(
    links.some((h) => h.includes("github.com")),
    `关于页没有 GitHub 链接：${links.join(", ")}`,
  );
  expect(!t.includes("待填写"), "关于页仍有「待填写」的占位");
  // 关于页的返回改成了图标按钮（aria-label），不再有文字
  await clickText("返回首页");
} else {
  problems.push("点不开「关于」");
}

// ---------- 向导 ----------
if (!(await clickText("开始出题"))) {
  problems.push("点不开「开始出题」");
} else {
  const t1 = bodyText();
  expect(t1.includes("选词范围"), "向导第一步不是「选词范围」");
  expect(t1.includes("教材"), "第一步没有教材选择器");
  expect(t1.includes("必填"), "第一步没有必填标记");

  // 问号 → 弹窗
  const help = [...doc.querySelectorAll('button[aria-label^="说明"]')][0];
  if (!help) {
    problems.push("配置项后面没有问号按钮");
  } else {
    const title = (help.getAttribute("aria-label") ?? "").replace("说明：", "");
    help.click();
    await wait(500);
    const dialog = doc.querySelector('[role="dialog"]');
    expect(!!dialog, `点问号后没有弹出说明框（${title}）`);
    if (dialog) {
      expect((dialog.textContent ?? "").length > 30, "说明弹窗内容是空的");
      expect((dialog.textContent ?? "").includes(title), "弹窗标题与配置项不一致");
    }
    [...doc.querySelectorAll('[role="dialog"] button')]
      .find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("close"))
      ?.click();
    await wait(300);
  }

  // 选择器：点开教材弹窗 → 逐个取消 → 校验必填
  const pickerBtn = [...doc.querySelectorAll("button")].find((n) =>
    (n.getAttribute("aria-label") ?? "").startsWith("教材："),
  );
  expect(!!pickerBtn, "第一步没有「教材」选择按钮");
  if (pickerBtn) {
    pickerBtn.click();
    await wait(500);
    const dialog = doc.querySelector('[role="dialog"]');
    expect(!!dialog, "点教材按钮后没有弹出选择框");
    if (dialog) {
      // aria-pressed 的选项块可能被 Mantine 的 portal 渲染到别处，
      // 所以从整个 document 里找，不用限定在 dialog 内
      const tiles = [...doc.querySelectorAll('button[aria-pressed]')];
      marks.tiles = tiles.length;
      expect(tiles.length >= 1, `教材弹窗里没有选项（${tiles.length}）`);
      // 逐个点掉已选的，模拟清空
      for (const t of tiles) {
        if (t.getAttribute("aria-pressed") === "true") {
          t.click();
          await wait(120);
        }
      }
      // 关掉弹窗
      [...dialog.querySelectorAll("button")]
        .find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("close"))
        ?.click();
      await wait(300);
    }
  }

  const nextBtn = [...doc.querySelectorAll("button")].find(
    (n) => n.textContent?.trim() === "下一步",
  );
  expect(nextBtn?.disabled === true, "教材一个都没选时「下一步」仍可点");
  expect(bodyText().includes("至少选一本书"), "没选教材时没有提示");

  // 重新选回来
  const pickerBtn2 = [...doc.querySelectorAll("button")].find((n) =>
    (n.getAttribute("aria-label") ?? "").startsWith("教材："),
  );
  if (pickerBtn2) {
    pickerBtn2.click();
    await wait(400);
    const d2 = doc.querySelector('[role="dialog"]');
    const tiles = [...doc.querySelectorAll("button[aria-pressed]")];
    for (const t of tiles) {
      if (t.getAttribute("aria-pressed") === "false") {
        t.click();
        await wait(100);
        break; // 选一本就够
      }
    }
    [...(d2?.querySelectorAll("button") ?? [])]
      .find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("close"))
      ?.click();
    await wait(400);
  }
  const nextBtn2 = [...doc.querySelectorAll("button")].find(
    (n) => n.textContent?.trim() === "下一步",
  );
  expect(nextBtn2?.disabled === false, "选回教材后「下一步」仍禁用");

  // 逐步前进
  const forward = async (steps, label) => {
    for (let i = 0; i < steps; i++) {
      if (!(await clickText("下一步"))) {
        problems.push(`${label}：第 ${i + 1} 次「下一步」点不到`);
        return false;
      }
    }
    return true;
  };

  if (await forward(1, "向导")) {
    expect(bodyText().includes("书后顺序"), "第二步不是排列与数量");
  }
  if (await forward(1, "向导")) {
    const t3 = bodyText();
    for (const m of ["四选 n", "句子默写", "选词填空", "笔记模式"]) {
      expect(t3.includes(m), `题型页缺少「${m}」`);
    }
  }
  if (await forward(1, "向导")) {
    const t4 = bodyText();
    expect(t4.includes("默写"), "第四步没有题型细节");
  }
  if (await forward(1, "向导")) {
    const t5 = bodyText();
    expect(t5.includes("中文释义来源"), "最后一步缺少中文来源设置");
    expect(t5.includes("预览"), "最后一步缺少预览");
    expect(t5.includes("senior"), `预览里没有真实词条：${t5.slice(-300)}`);
    expect(t5.includes("生成文档"), "最后一步缺少生成按钮");
  }

  expect(await clickText("上一步"), "「上一步」点不到");
}

if (external.length) problems.push(`发生了外部资源请求：${external.join(", ")}`);

const realErrors = errors.filter(
  (e) =>
    !/Could not parse CSS stylesheet|Not implemented: window\.|Not implemented: navigation/.test(e),
);
if (realErrors.length) problems.push(`运行时错误：${realErrors.slice(0, 3).join(" | ")}`);

if (problems.length) {
  console.error("✗ 预览版存在问题：");
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

console.log("✓ 预览版渲染与交互均正常");
console.log(
  `  首页 → 关于 → 向导 5 步 → 选择器弹窗（${marks.tiles} 个选项）→ 必填校验 → 回退`,
);
if (realErrors.length) console.log("  （忽略的警告：", realErrors.slice(0, 2).join(" | "), "）");
