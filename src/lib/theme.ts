/**
 * 全部样式来自 Radix Themes 自带的设计系统。
 *
 * 之前是 Tailwind + Mantine 混搭：Tailwind 的 preflight 会把 Mantine 的
 * 按钮背景、Checkbox 方框、Modal 定位重置掉，表现就是按钮全白、
 * 勾选框消失、弹窗跑到屏幕外。Radix Themes 自带完整 CSS，
 * 不依赖任何 CSS 框架，从根上避免这类冲突。
 *
 * 配色：主色取应用图标上那支笔的蓝，中性色 slate。
 * 深色模式由 Radix 自己处理 —— 它为每个色阶分别调过对比度，
 * 不会出现「切到深色后按钮还是亮得刺眼」。
 */
export const THEME = {
  accentColor: "blue",
  grayColor: "slate",
  radius: "large",
  scaling: "100%",
  panelBackground: "translucent",
} as const;

/** 触控尺寸下限：手机上一律不小于 44px */
export const TOUCH = 44;
