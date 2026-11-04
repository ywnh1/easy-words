/** 与 Rust 端 db.rs / pdf.rs 对应的类型。 */

export type Bucket = { key: string; count: number };

export type BookInfo = {
  id: string;
  title: string;
  volume: string;
  kind: string;
  sort_order: number;
  total: number;
  units: Bucket[];
  pages: Bucket[];
  initials: Bucket[];
  markers: Record<string, number>;
  sources: Record<string, number>;
  with_examples: number;
};

export type Example = { en: string; zh: string; source: string; label: string };

export type Sense = { source: string; pos: string; zh: string };

export type EntryView = {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  is_phrase: boolean;
  marker: string;
  book: string;
  unit_no: number;
  page: number | null;
  examples: Example[];
  senses: Sense[];
};

export type Filter = {
  book_ids: string[];
  units: number[];
  pages: number[];
  initials: string[];
  markers: string[];
  sources: string[];
  query: string;
  shuffle: boolean;
  needs_meaning: boolean;
  kinds: ("word" | "phrase")[];
  order: OrderBy;
  limit: number | null;
  /** 随机种子：预览与导出共用同一个，保证看到的就是导出的 */
  seed: number;
};

/** 排列顺序：书后单词表顺序 / 首字母 / 随机 */
export type OrderBy = "book" | "initial" | "random";

export type Mode = "columns" | "sentence" | "cloze" | "notes";
export type Field = "word" | "phonetic" | "meaning" | "blank";
export type Hint = "none" | "zh" | "en" | "phonetic" | "initial";
export type SenseSource =
  | "textbook"
  | "oxford_high"
  | "collins"
  | "oxford_bilingual"
  | "ai";

export type Spec = {
  mode: Mode;
  fields: Field[];
  hint?: Hint;
  overrides: Record<string, Hint>;
  /** 随机种子：决定选哪条例句。与 filter.seed 保持一致，预览与导出才同卷 */
  seed: number;
  pool?: number;
  blanks?: number;
  sense_sources: SenseSource[];
  example_sources: string[];
  answer_key: boolean;
  title?: string;
  subtitle?: string;
};

/** 导出格式 */
export type Format = "pdf" | "docx";

export type ExportResult = {
  /** 完整路径（桌面用来打开文件）；Android 上是 content:// URI */
  path: string;
  /** 给用户看的短路径，Android 上是「Download/Easy Words/xxx.pdf」 */
  display_path: string;
  /** Android 分享用的 content:// URI；桌面为空 */
  uri: string;
  count: number;
  file_name: string;
  size: number;
};

export const FORMAT_LABEL: Record<Format, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
};

export const FIELD_LABEL: Record<Field, string> = {
  word: "英文",
  phonetic: "音标",
  meaning: "中文",
  blank: "默写",
};

export const HINT_LABEL: Record<Hint, string> = {
  none: "只挖空",
  zh: "中文",
  en: "英文",
  phonetic: "音标",
  initial: "首字母",
};

export const SENSE_LABEL: Record<SenseSource, string> = {
  textbook: "书后中文",
  oxford_high: "牛津高阶",
  collins: "柯林斯",
  oxford_bilingual: "牛津双解",
  ai: "AI 翻译",
};

export const MODE_LABEL: Record<Mode, string> = {
  columns: "四选 n",
  sentence: "句子默写",
  cloze: "选词填空",
  notes: "笔记模式",
};

export const MODE_DESC: Record<Mode, string> = {
  columns: "从英文/音标/中文/默写里选若干列，顺序可调。有默写列才出答案。",
  sentence: "例句挖空，可为每个词单独指定提示方式。",
  cloze: "方框里给 n 个短语，下面出 n-m 个句子，不含提示。",
  notes: "英文 + 音标 + 多来源中文 + 例句，供整理复习，无答案页。",
};
