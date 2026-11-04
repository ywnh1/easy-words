/**
 * 出题配置的单一状态源。
 *
 * 所有「用户填了什么」都放在这里，向导的每一步只读写自己那部分。
 * filter / spec 由这些状态派生，预览和导出共用同一份，避免两边口径不一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { catalog, countEntries, exportDocument, preview as fetchPreview } from "../lib/api";
import type {
  BookInfo,
  EntryView,
  Field,
  ExportResult,
  Filter,
  Format,
  Hint,
  Mode,
  OrderBy,
  SenseSource,
  Spec,
} from "../lib/types";

const ALL_SENSES: SenseSource[] = [
  "textbook",
  "oxford_high",
  "collins",
  "oxford_bilingual",
  "ai",
];

function parsePages(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,，\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-~—]\s*(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const lo = Math.min(a, b);
      for (let i = lo; i <= Math.max(a, b) && i - lo < 500; i++) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function useQuiz() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  // —— 范围 ——
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [units, setUnits] = useState<number[]>([]);
  const [pagesText, setPagesText] = useState("");
  const [initials, setInitials] = useState<string[]>([]);
  const [markers, setMarkers] = useState<string[]>([]);
  const [kinds, setKinds] = useState<("word" | "phrase")[]>([]);
  const [query, setQuery] = useState("");

  // —— 排列与数量 ——
  const [order, setOrder] = useState<OrderBy>("book");
  const [pickN, setPickN] = useState(0);
  const [seed, setSeed] = useState(1);

  // —— 中文来源 ——
  const [senseAll, setSenseAll] = useState<SenseSource[]>(ALL_SENSES);
  const [senseOn, setSenseOn] = useState<Record<SenseSource, boolean>>({
    textbook: true,
    oxford_high: true,
    collins: false,
    oxford_bilingual: false,
    ai: false,
  });

  // —— 题型 ——
  const [mode, setMode] = useState<Mode>("columns");
  const [fields, setFields] = useState<Field[]>(["word", "phonetic", "meaning", "blank"]);
  const [hint, setHint] = useState<Hint>("zh");
  const [overrides, setOverrides] = useState<Record<string, Hint>>({});
  const [clozeN, setClozeN] = useState(6);
  const [clozeM, setClozeM] = useState(2);
  const [exampleSources, setExampleSources] = useState<string[]>([]);
  const [answerKey, setAnswerKey] = useState(true);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("pdf");

  const [preview, setPreview] = useState<EntryView[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** 导出成功后的结果，用来弹「已保存 / 分享」对话框 */
  const [exported, setExported] = useState<ExportResult | null>(null);
  /** 导出失败的原因；和 exported 一起决定弹窗内容 */
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    catalog()
      .then((list) => {
        setBooks(list);
        setBookIds(list.map((b) => b.id));
      })
      .catch((e) => setBootError(String(e)));
  }, []);

  const senseSources = useMemo(
    () => senseAll.filter((s) => senseOn[s]),
    [senseAll, senseOn],
  );

  const filter: Filter = useMemo(
    () => ({
      book_ids: bookIds,
      units,
      pages: parsePages(pagesText),
      initials,
      markers,
      sources: [],
      query,
      shuffle: false,
      needs_meaning: mode === "columns" || mode === "sentence",
      kinds,
      order,
      limit: order === "random" && pickN > 0 ? pickN : null,
      seed,
    }),
    [bookIds, units, pagesText, initials, markers, query, mode, kinds, order, pickN, seed],
  );

  // 输入变化 → 防抖后重新统计与预览
  const seq = useRef(0);
  useEffect(() => {
    if (bookIds.length === 0) {
      setPreview([]);
      setTotal(0);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      Promise.all([fetchPreview(filter, 40), countEntries(filter)])
        .then(([list, n]) => {
          if (id !== seq.current) return;
          setPreview(list);
          setTotal(n);
        })
        .catch((e) => setMsg({ ok: false, text: String(e) }));
    }, 220);
    return () => clearTimeout(t);
  }, [filter, bookIds.length]);

  const selectedBooks = books.filter((b) => bookIds.includes(b.id));

  const allUnits = useMemo(() => {
    const set = new Set<number>();
    selectedBooks.forEach((b) => b.units.forEach((u) => set.add(Number(u.key))));
    return [...set].sort((a, b) => a - b);
  }, [selectedBooks]);

  const allInitials = useMemo(() => {
    const map = new Map<string, number>();
    selectedBooks.forEach((b) =>
      b.initials.forEach((i) => map.set(i.key, (map.get(i.key) ?? 0) + i.count)),
    );
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedBooks]);

  /** 选中教材里出现过的页码，给页码选择器用 */
  const allPages = useMemo(() => {
    const set = new Set<number>();
    selectedBooks.forEach((b) => b.pages.forEach((p) => set.add(Number(p.key))));
    return [...set].sort((a, b) => a - b);
  }, [selectedBooks]);

  const markerCount = useMemo(() => {
    const m: Record<string, number> = {};
    selectedBooks.forEach((b) =>
      Object.entries(b.markers).forEach(([k, v]) => (m[k] = (m[k] ?? 0) + v)),
    );
    return m;
  }, [selectedBooks]);

  const subtitle = useMemo(() => {
    const names = selectedBooks.map((b) => b.volume || b.title).join("、") || "全部";
    const u = units.length ? ` · UNIT ${units.join(",")}` : "";
    return `${names}${u} · 共 ${total} 题`;
  }, [selectedBooks, units, total]);

  const spec: Spec = useMemo(
    () => ({
      mode,
      fields,
      hint,
      overrides,
      pool: clozeN + clozeM,
      blanks: clozeN,
      sense_sources: senseSources,
      example_sources: exampleSources,
      answer_key: mode === "notes" ? false : answerKey,
      title: title.trim() || undefined,
      subtitle,
    }),
    [
      mode,
      fields,
      hint,
      overrides,
      clozeN,
      clozeM,
      senseSources,
      exampleSources,
      answerKey,
      title,
      subtitle,
    ],
  );

  const clearExport = useCallback(() => {
    setExported(null);
    setExportError(null);
  }, []);

  const doExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await exportDocument(filter, spec, format);
      // 不再自动打开文件：手机上打开 PDF 会切走应用，
      // 也没告诉用户文件在哪。改成弹窗，让用户自己选分享还是打开。
      setExported(res);
      setExportError(null);
      setMsg(null);
      return true;
    } catch (e) {
      // 失败也弹窗：之前只写在页面底部，用户点了按钮毫无反应，以为卡死
      setExportError(String(e));
      setMsg({ ok: false, text: String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [filter, spec, format]);

  return {
    // 数据
    books,
    bootError,
    preview,
    total,
    selectedBooks,
    allUnits,
    allInitials,
    allPages,
    markerCount,
    // 范围
    bookIds,
    setBookIds,
    units,
    setUnits,
    pagesText,
    setPagesText,
    initials,
    setInitials,
    markers,
    setMarkers,
    kinds,
    setKinds,
    query,
    setQuery,
    // 排列
    order,
    setOrder,
    pickN,
    setPickN,
    seed,
    setSeed,
    // 中文
    senseAll,
    setSenseAll,
    senseOn,
    setSenseOn,
    senseSources,
    // 题型
    mode,
    setMode,
    fields,
    setFields,
    hint,
    setHint,
    overrides,
    setOverrides,
    clozeN,
    setClozeN,
    clozeM,
    setClozeM,
    exampleSources,
    setExampleSources,
    answerKey,
    setAnswerKey,
    title,
    setTitle,
    format,
    setFormat,
    // 导出
    spec,
    subtitle,
    busy,
    msg,
    setMsg,
    exported,
    setExported,
    exportError,
    clearExport,
    doExport,
  };
}

export type Quiz = ReturnType<typeof useQuiz>;
