/**
 * 后端调用入口。
 *
 * 真正的应用跑在 Tauri 里，这里转给 Rust。
 * 但把前端单独拿手机浏览器打开时（纯静态预览），没有 Rust 可用，
 * 于是退回到 scripts/export_mock.py 导出的那份精简数据，
 * 让界面、筛选、预览都能照常点。导出 PDF 在预览模式下不可用。
 */
import { invoke } from "@tauri-apps/api/core";
import { openPath as tauriOpenPath } from "@tauri-apps/plugin-opener";
import type { BookInfo, EntryView, ExportResult, Filter, Spec } from "./types";

/** 跑在 Tauri 窗口里吗 */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ------------------------------------------------------------ 预览用的假后端

type MockData = typeof import("./mock-data")["MOCK"];

// 动态加载：只有真的不在 Tauri 里时才拉这份 200KB 的数据，
// 正式安装包里不会带上它（构建时会切成独立 chunk）。
let mockPromise: Promise<MockData> | null = null;
function mockData(): Promise<MockData> {
  if (!mockPromise) mockPromise = import("./mock-data").then((m) => m.MOCK);
  return mockPromise;
}

let cachedOrder: Map<string, number> | null = null;

function matches(e: MockData["entries"][number], f: Filter): boolean {
  if (f.book_ids.length && !f.book_ids.includes(e.book_id)) return false;
  if (f.units.length && !f.units.includes(e.unit_no)) return false;
  if (f.pages.length && (e.page === null || !f.pages.includes(e.page))) return false;
  if (f.initials.length && !f.initials.includes(e.word.charAt(0).toLowerCase())) return false;
  if (f.markers.length && !f.markers.includes(e.marker)) return false;
  if (f.kinds.length) {
    const kind = e.is_phrase ? "phrase" : "word";
    if (!f.kinds.includes(kind as "word" | "phrase")) return false;
  }
  if (f.needs_meaning && !e.senses.some((s) => s.zh)) return false;
  const needles = f.query
    .split(/[,，;；\n\r\t ]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (needles.length) {
    const w = e.word.toLowerCase();
    const hit = needles.some((n) => w.includes(n));
    const phraseQuery = needles.join(" ");
    if (!hit && !w.includes(phraseQuery)) return false;
  }
  return true;
}

/** 与 Rust 端同一套 splitmix + xorshift，保证预览和导出的取词口径一致 */
function rng(seed: number): () => number {
  let s = (seed + 0x9e3779b97f4a7c15) >>> 0;
  s = Math.imul(s ^ (s >>> 30), 0xbf58476d) >>> 0;
  s = Math.imul(s ^ (s >>> 27), 0x94d049bb) >>> 0;
  s = (s ^ (s >>> 31)) | 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 7;
    s ^= s << 17;
    return s >>> 0;
  };
}

function lookup(data: MockData, filter: Filter): EntryView[] {
  if (!cachedOrder) {
    cachedOrder = new Map(data.books.map((b, i) => [b.id, b.sort_order ?? i]));
  }
  const bookOrder = cachedOrder;
  let list = data.entries.filter((e) => matches(e, filter));

  if (filter.order === "initial") {
    list = [...list].sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
  } else if (filter.order === "book") {
    list = [...list].sort(
      (a, b) =>
        (bookOrder.get(a.book_id) ?? 0) - (bookOrder.get(b.book_id) ?? 0) ||
        a.unit_no - b.unit_no,
    );
  } else {
    const next = rng(filter.seed);
    list = [...list];
    for (let i = list.length - 1; i > 0; i--) {
      const j = next() % (i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (filter.limit) list = list.slice(0, filter.limit);
  }

  return list.map((e) => ({
    word: e.word,
    phonetic: e.phonetic,
    pos: e.pos,
    meaning: e.meaning,
    is_phrase: e.is_phrase,
    marker: e.marker,
    book: e.book,
    unit_no: e.unit_no,
    page: e.page,
    examples: e.examples.map((x) => ({ ...x })),
    senses: e.senses.map((s) => ({ ...s })),
  }));
}

// ------------------------------------------------------------ 对外接口

export async function catalog(): Promise<BookInfo[]> {
  if (!inTauri) {
    const data = await mockData();
    return data.books.map((b) => ({ ...b })) as unknown as BookInfo[];
  }
  return invoke<BookInfo[]>("catalog");
}

export async function preview(filter: Filter, limit: number): Promise<EntryView[]> {
  if (!inTauri) return lookup(await mockData(), filter).slice(0, limit);
  return invoke<EntryView[]>("preview", { filter, limit });
}

export async function countEntries(filter: Filter): Promise<number> {
  if (!inTauri) return lookup(await mockData(), filter).length;
  return invoke<number>("count_entries", { filter });
}

export async function exportPdf(filter: Filter, spec: Spec): Promise<ExportResult> {
  if (!inTauri) {
    throw new Error(
      "这是纯前端预览版，没有 Rust 后端，无法生成 PDF。" +
        "完整功能请在桌面或安卓客户端里使用。",
    );
  }
  return invoke<ExportResult>("export_pdf", { filter, spec });
}

export async function openPath(path: string): Promise<void> {
  if (!inTauri) return;
  return tauriOpenPath(path);
}
