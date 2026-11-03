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
  /** 中译英 / 单词表需要中文题干 */
  needs_meaning: boolean;
};

export type Kind = "cn2_en" | "en2_cn" | "table" | "blank";
export type Hint = "none" | "zh" | "en" | "initial";

export type Spec = {
  kind: Kind;
  hint?: Hint;
  answer_key: boolean;
  title?: string;
  subtitle?: string;
};

export type ExportResult = { path: string; count: number };
