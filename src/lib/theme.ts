/**
 * 设计 token 与 Mantine 主题。
 *
 * 配色取自应用图标（蓝色笔记本 + 红色 A+），所以主色是蓝而不是套模板的紫：
 * 图标和界面用同一套色，看起来才是一个东西。
 *
 * 字号和触控尺寸都按移动端定的 —— 这个应用主要在手机上用。
 * Mantine 默认 md 控件高 36px，手指点不准，全部抬到 44/48。
 */
import { createTheme, type MantineColorsTuple } from "@mantine/core";

/** 主色：图标上那支笔的蓝，色阶从浅到深 */
const brand: MantineColorsTuple = [
  "#eef4ff",
  "#dbe6ff",
  "#b7cbff",
  "#8fadff",
  "#6b93fa",
  "#3b82f6", // 6 = 主色
  "#2f6fe0",
  "#255cbe",
  "#1e4a9b",
  "#173a79",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: { brand },
  defaultRadius: "md",

  // 字号整体上调：13px 在手机上小得费眼
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
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "2rem", lineHeight: "1.2" },
      h2: { fontSize: "1.5rem", lineHeight: "1.25" },
      h3: { fontSize: "1.125rem", lineHeight: "1.35" },
    },
  },

  // 触控优先：所有交互元素至少 44px
  components: {
    Button: {
      defaultProps: { size: "md" },
      styles: { root: { minHeight: 44 } },
    },
    ActionIcon: {
      defaultProps: { size: "lg" },
      styles: { root: { minWidth: 44, minHeight: 44 } },
    },
    TextInput: { defaultProps: { size: "md" } },
    NumberInput: { defaultProps: { size: "md" } },
    Select: { defaultProps: { size: "md" } },
    MultiSelect: { defaultProps: { size: "md" } },
    Checkbox: {
      defaultProps: { size: "md" },
      styles: { root: { minHeight: 44, alignItems: "center" } },
    },
    Switch: { defaultProps: { size: "md" } },
    Chip: {
      defaultProps: { size: "md" },
      styles: { label: { minHeight: 40, paddingInline: 14 } },
    },
    SegmentedControl: { defaultProps: { size: "md" } },
    Modal: { defaultProps: { centered: true, radius: "lg" } },
  },
});
