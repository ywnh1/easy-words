/**
 * 设计 token 与 Mantine 主题。
 *
 * 配色取自应用图标（蓝色笔记本 + 红色 A+），主色是蓝而不是套模板的紫。
 *
 * 三条硬规矩，都是为了不出现「一片纯白分不清层次」：
 *   1. 页面底色浅灰，卡片才白 —— 靠底色差分层次，不靠阴影
 *   2. 可点元素都有可见边框（中性灰），不靠 hover 才显形
 *   3. 只用「灰底 / 白卡 / 品牌色」三档，不叠更多灰
 *
 * 字号与触控尺寸按移动端定：这个应用主要在手机上用。
 * Mantine 默认 md 控件高 36px，手指点不准，统一抬到 44 左右。
 */
import { createTheme, type MantineColorsTuple } from "@mantine/core";

/** 主色：图标上那支笔的蓝 */
const brand: MantineColorsTuple = [
  "#eff5ff",
  "#dbe8fe",
  "#b8d0fc",
  "#8fb4f8",
  "#6a9bf3",
  "#3b82f6", // 6 = 主色
  "#2f6ede",
  "#2559ba",
  "#1d4696",
  "#173572",
];

/** 中性色：偏冷的灰，和白卡放在一起不发脏 */
const slate: MantineColorsTuple = [
  "#f8fafc",
  "#f1f5f9",
  "#e7edf3",
  "#d3dce6",
  "#aebbc9",
  "#8593a3",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: { brand, slate },
  defaultRadius: "lg",

  fontSizes: {
    xs: "0.8125rem", // 13
    sm: "0.875rem", // 14
    md: "0.9375rem", // 15
    lg: "1.0625rem", // 17
    xl: "1.25rem", // 20
  },

  fontFamily:
    'system-ui, -apple-system, "Noto Sans SC", "PingFang SC", "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'system-ui, -apple-system, "Noto Sans SC", "PingFang SC", "Segoe UI", sans-serif',
    fontWeight: "650",
    sizes: {
      h1: { fontSize: "1.875rem", lineHeight: "1.2" },
      h2: { fontSize: "1.375rem", lineHeight: "1.3" },
      h3: { fontSize: "1.0625rem", lineHeight: "1.4" },
    },
  },

  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },

  components: {
    Button: {
      defaultProps: { size: "md" },
      styles: { root: { minHeight: 46, fontWeight: 550 } },
    },
    ActionIcon: {
      // 触控区 42px：够手指点，又不会在一行里显得笨重
      styles: { root: { minWidth: 42, minHeight: 42 } },
    },
    Paper: {
      defaultProps: { withBorder: true },
      styles: { root: { borderColor: "var(--mantine-color-slate-3)" } },
    },
    TextInput: { defaultProps: { size: "md", radius: "md" } },
    NumberInput: { defaultProps: { size: "md", radius: "md" } },
    Select: { defaultProps: { size: "md", radius: "md" } },
    MultiSelect: { defaultProps: { size: "md", radius: "md" } },
    Checkbox: {
      defaultProps: { size: "md", radius: "sm" },
      styles: { root: { minHeight: 44 }, body: { alignItems: "center" } },
    },
    Switch: {
      defaultProps: { size: "md" },
      styles: { root: { minHeight: 44 } },
    },
    /**
     * 选项芯片。默认是白底 + 可见边框，
     * 选中变成浅品牌底 + 品牌色描边 —— 比整块实心更耐看，
     * 也不会和页面里其它白卡混在一起。
     */
    Chip: {
      defaultProps: { size: "md", variant: "light", radius: "md" },
      styles: {
        label: {
          minHeight: 42,
          paddingInline: 16,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "var(--mantine-color-slate-3)",
          background: "var(--mantine-color-white)",
          color: "var(--mantine-color-slate-8)",
          fontWeight: 500,
        },
        labelChecked: {
          borderColor: "var(--mantine-color-brand-6)",
          background: "var(--mantine-color-brand-0)",
          color: "var(--mantine-color-brand-8)",
          fontWeight: 600,
        },
      },
    },
    SegmentedControl: {
      defaultProps: { size: "md", radius: "md" },
      styles: {
        root: {
          background: "var(--mantine-color-slate-1)",
          border: "1px solid var(--mantine-color-slate-3)",
          padding: 3,
        },
        indicator: { boxShadow: "0 1px 3px rgba(15,23,42,.12)" },
      },
    },
    Modal: {
      defaultProps: { centered: true, radius: "lg" },
      styles: { content: { border: "1px solid var(--mantine-color-slate-3)" } },
    },
    Divider: { defaultProps: { color: "slate.2" } },
  },
});
