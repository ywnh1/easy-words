import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button, Check, Chip, Panel, Select, TextInput } from "./components/ui";
import { cn } from "./lib/cn";
import {
  FIELD_LABEL,
  HINT_LABEL,
  MODE_DESC,
  MODE_LABEL,
  SENSE_LABEL,
  type BookInfo,
  type EntryView,
  type ExportResult,
  type Field,
  type Filter,
  type Hint,
  type Mode,
  type OrderBy,
  type SenseSource,
  type Spec,
} from "./lib/types";

const MARKER_LABEL: Record<string, string> = {
  none: "普通词",
  star: "加星 *",
  box: "方框 □",
};

const ORDER_LABEL: Record<OrderBy, string> = {
  book: "书后顺序",
  initial: "首字母",
  random: "随机",
};

const ALL_FIELDS: Field[] = ["word", "phonetic", "meaning", "blank"];
const ALL_SENSES: SenseSource[] = [
  "textbook",
  "oxford_high",
  "collins",
  "oxford_bilingual",
  "ai",
];
const ALL_HINTS: Hint[] = ["none", "zh", "en", "phonetic", "initial"];

function parsePages(text: string): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,，\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*[-~—]\s*(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 500; i++) {
        out.add(i);
      }
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** 可排序列表：拖动 + 上下箭头两种方式都能调顺序。 */
function SortableList<T extends string>({
  items,
  label,
  onChange,
  onToggle,
  isOn,
}: {
  items: T[];
  label: (v: T) => string;
  onChange: (next: T[]) => void;
  /** 提供时每项前面出现勾选框 */
  onToggle?: (v: T) => void;
  /** 勾选状态；不提供则全部视为启用 */
  isOn?: (v: T) => boolean;
}) {
  const dragFrom = useRef<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [v] = next.splice(from, 1);
    next.splice(to, 0, v);
    onChange(next);
  }

  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
        const on = isOn ? isOn(it) : true;
        return (
          <li
            key={it}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
              on ? "border-[var(--color-line)]" : "border-dashed opacity-45",
            )}
          >
            {onToggle && (
              <input
                type="checkbox"
                checked={on}
                onChange={() => onToggle(it)}
                className="size-3.5 accent-[var(--color-accent)]"
              />
            )}
            <span className="flex-1 cursor-grab select-none">{label(it)}</span>
            <span className="text-[11px] text-[var(--color-muted)]">{i + 1}</span>
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              className="px-1 text-xs disabled:opacity-25"
              aria-label="上移"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === items.length - 1}
              className="px-1 text-xs disabled:opacity-25"
              aria-label="下移"
            >
              ▼
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function App() {
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
  const [pickN, setPickN] = useState(0); // 0 = 全取
  // 随机种子：换一批才变，预览与导出共用，避免"看到的和导出的是两批词"
  const [seed, setSeed] = useState(1);

  // —— 中文来源（有序，勾选的才用） ——
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
  const [clozeN, setClozeN] = useState(6); // 要考察的短语数 = 句子数
  const [clozeM, setClozeM] = useState(2); // 多余的干扰选项数
  const [exampleSources, setExampleSources] = useState<string[]>([]);
  const [answerKey, setAnswerKey] = useState(true);
  const [title, setTitle] = useState("");

  const [preview, setPreview] = useState<EntryView[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    invoke<BookInfo[]>("catalog")
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
      // 中文题干必须能取到中文
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
      Promise.all([
        invoke<EntryView[]>("preview", { filter, limit: 40 }),
        invoke<number>("count_entries", { filter }),
      ])
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

  const spec: Spec = useMemo(() => {
    const base: Spec = {
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
    };
    return base;
  }, [mode, fields, hint, overrides, clozeN, clozeM, senseSources, exampleSources, answerKey, title, subtitle]);

  const doExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await invoke<ExportResult>("export_pdf", { filter, spec });
      setMsg({ ok: true, text: `已生成 ${res.count} 题 → ${res.path}` });
      try {
        await openPath(res.path);
      } catch {
        /* 打开失败不影响导出 */
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }, [filter, spec]);

  if (bootError) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-lg text-sm">
          <h1 className="mb-2 text-lg font-semibold">无法读取词库</h1>
          <pre className="whitespace-pre-wrap rounded-lg bg-[var(--color-panel)] p-3 text-xs">
            {bootError}
          </pre>
          <p className="mt-3 text-[var(--color-muted)]">
            若在浏览器里打开页面（而非 Tauri 窗口），功能不可用属于预期行为。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-3 p-3 lg:flex-row">
      {/* ── 左：范围 ─────────────────────────────── */}
      <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto pb-2 lg:w-[330px]">
        <Panel title="教材">
          <div className="flex flex-wrap gap-1.5">
            {books.map((b) => (
              <Chip
                key={b.id}
                active={bookIds.includes(b.id)}
                onClick={() => {
                  setBookIds(toggle(bookIds, b.id));
                  setUnits([]);
                  setInitials([]);
                }}
                title={`${b.total} 条`}
              >
                {b.volume || b.title}
              </Chip>
            ))}
          </div>
        </Panel>

        <Panel
          title={`单元${units.length ? ` · 已选 ${units.length}` : " · 全部"}`}
          right={
            <button
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              onClick={() => setUnits(units.length ? [] : allUnits)}
            >
              {units.length ? "清空" : "全选"}
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {allUnits.map((u) => (
              <Chip key={u} active={units.includes(u)} onClick={() => setUnits(toggle(units, u))}>
                {u}
              </Chip>
            ))}
            {allUnits.length === 0 && (
              <span className="text-xs text-[var(--color-muted)]">先选教材</span>
            )}
          </div>
        </Panel>

        <Panel
          title={`首字母${initials.length ? ` · 已选 ${initials.length}` : " · 全部"}`}
          right={
            <button
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              onClick={() => setInitials([])}
            >
              清空
            </button>
          }
        >
          <div className="flex flex-wrap gap-1">
            {allInitials.map(([ch]) => (
              <button
                key={ch}
                onClick={() => setInitials(toggle(initials, ch))}
                className={cn(
                  "size-7 rounded-md border text-[13px] uppercase transition",
                  initials.includes(ch)
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-line)] hover:border-[var(--color-accent)]",
                )}
              >
                {ch}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="追加范围（空=不限）">
          <div className="space-y-2.5">
            <label className="block text-xs text-[var(--color-muted)]">
              页码
              <TextInput
                className="mt-1"
                placeholder="如 12-20, 35"
                value={pagesText}
                onChange={(e) => setPagesText(e.target.value)}
              />
            </label>
            <label className="block text-xs text-[var(--color-muted)]">
              指定单词短语
              <TextInput
                className="mt-1"
                placeholder="逗号或换行分隔"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </Panel>

        <Panel title="词汇标记">
          <div className="grid grid-cols-2 gap-x-2">
            {["none", "star", "box"].map((m) => (
              <Check
                key={m}
                checked={markers.includes(m)}
                onChange={() => setMarkers(toggle(markers, m))}
                label={MARKER_LABEL[m]}
                hint={markerCount[m] ? String(markerCount[m]) : undefined}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-2 border-t border-[var(--color-line)] pt-2">
            <Check
              checked={kinds.includes("word")}
              onChange={() => setKinds(toggle(kinds, "word"))}
              label="只单词"
            />
            <Check
              checked={kinds.includes("phrase")}
              onChange={() => setKinds(toggle(kinds, "phrase"))}
              label="只短语"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-muted)]">
            都不勾选 = 不限。
          </p>
        </Panel>

        <Panel title={`排列与数量${order === "random" && pickN > 0 ? ` · 随机 ${pickN} 个` : ""}`}>
          <div className="flex gap-1.5">
            {(Object.keys(ORDER_LABEL) as OrderBy[]).map((o) => (
              <Chip key={o} active={order === o} onClick={() => setOrder(o)}>
                {ORDER_LABEL[o]}
              </Chip>
            ))}
          </div>
          <label className="mt-2.5 block text-xs text-[var(--color-muted)]">
            随机抽取条数（0 = 全取，仅在「随机」时生效）
            <TextInput
              className="mt-1"
              type="number"
              min={0}
              value={pickN}
              onChange={(e) => setPickN(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          {order === "random" && (
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() => setSeed((s) => (s * 1103515245 + 12345) % 2147483647 || 1)}
            >
              换一批
            </Button>
          )}
        </Panel>
      </aside>

      {/* ── 右：题型 ─────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <Panel title="中文释义来源优先（排在前面的先用）">
          <SortableList
            items={senseAll}
            label={(s) => SENSE_LABEL[s]}
            onChange={setSenseAll}
            onToggle={(s) => setSenseOn({ ...senseOn, [s]: !senseOn[s] })}
            isOn={(s) => senseOn[s]}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-muted)]">
            未勾选的来源不参与。笔记模式会把勾选的来源全部列出。
          </p>
        </Panel>

        <Panel title="题型">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded-lg border p-2.5 text-left text-sm font-medium transition",
                  mode === m
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-line)] hover:border-[var(--color-accent)]",
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">{MODE_DESC[mode]}</p>

          {mode === "columns" && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-[var(--color-muted)]">
                选择列并排序（勾选要显示的列；含「默写」才生成答案）
              </div>
              <SortableList
                items={fields}
                label={(f) => FIELD_LABEL[f]}
                onChange={setFields}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ALL_FIELDS.filter((f) => !fields.includes(f)).map((f) => (
                  <Chip key={f} active={false} onClick={() => setFields([...fields, f])}>
                    + {FIELD_LABEL[f]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {mode === "sentence" && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-[var(--color-muted)]">
                全局提示方式（可在下方预览里为单个词覆盖）
                <div className="mt-1">
                  <Select
                    value={hint}
                    onChange={(v) => setHint(v as Hint)}
                    options={ALL_HINTS.map((h) => ({ value: h, label: HINT_LABEL[h] }))}
                  />
                </div>
              </label>
              {Object.keys(overrides).length > 0 && (
                <button
                  className="text-xs text-[var(--color-accent)]"
                  onClick={() => setOverrides({})}
                >
                  清除 {Object.keys(overrides).length} 个逐词覆盖
                </button>
              )}
            </div>
          )}

          {mode === "cloze" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-[var(--color-muted)]">
                N · 考察短语数（= 句子数）
                <TextInput
                  className="mt-1"
                  type="number"
                  min={1}
                  value={clozeN}
                  onChange={(e) => setClozeN(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="block text-xs text-[var(--color-muted)]">
                M · 多余干扰选项数
                <TextInput
                  className="mt-1"
                  type="number"
                  min={0}
                  value={clozeM}
                  onChange={(e) => setClozeM(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <p className="text-[11px] text-[var(--color-muted)] sm:col-span-2">
                方框里共 {clozeN + clozeM} 个选项（{clozeN} 个答案 + {clozeM} 个干扰），下面出{" "}
                {clozeN} 个句子。
              </p>
            </div>
          )}

          {mode === "notes" && (
            <div className="mt-3">
              <div className="text-xs text-[var(--color-muted)]">例句来源（不勾选 = 不附例句）</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[
                  { v: "oxford", label: "牛津" },
                  { v: "collins", label: "柯林斯" },
                  { v: "own", label: "自撰" },
                ].map((s) => (
                  <Chip
                    key={s.v}
                    active={exampleSources.includes(s.v)}
                    onClick={() => setExampleSources(toggle(exampleSources, s.v))}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-[var(--color-muted)]">
              卷头标题（留空用默认）
              <TextInput
                className="mt-1"
                placeholder={MODE_LABEL[mode]}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="flex items-end pb-1.5">
              <Check
                checked={mode === "notes" ? false : answerKey}
                onChange={setAnswerKey}
                label={mode === "notes" ? "笔记模式无答案页" : "附参考答案页"}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title={`预览 · 命中 ${total} 条`}
          right={
            <Button variant="primary" size="sm" onClick={doExport} disabled={busy || total === 0}>
              {busy ? "生成中…" : "生成 PDF"}
            </Button>
          }
          className="min-h-0 flex-1"
        >
          <div className="h-full max-h-[calc(100vh-420px)] overflow-y-auto thin-scroll">
            {total === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                {bookIds.length === 0 ? "选择教材后显示词条" : "当前筛选没有命中，放宽条件试试"}
              </p>
            )}
            <ul className="divide-y divide-[var(--color-line)]">
              {preview.map((e, i) => (
                <li key={`${e.word}-${i}`} className="flex items-center gap-2.5 py-1.5 text-sm">
                  <span className="w-6 shrink-0 text-right text-xs text-[var(--color-muted)]">
                    {i + 1}
                  </span>
                  <span className="shrink-0 font-medium">{e.word}</span>
                  {e.phonetic && (
                    <span className="shrink-0 text-xs text-[var(--color-muted)]">{e.phonetic}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{e.meaning}</span>
                  {mode === "sentence" && (
                    <select
                      value={overrides[e.word.toLowerCase()] ?? ""}
                      onChange={(ev) => {
                        const v = ev.target.value as Hint | "";
                        const next = { ...overrides };
                        if (!v) delete next[e.word.toLowerCase()];
                        else next[e.word.toLowerCase()] = v;
                        setOverrides(next);
                      }}
                      className="h-6 shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-1 text-[11px]"
                      title="为这个词单独指定提示方式"
                    >
                      <option value="">跟随全局</option>
                      {ALL_HINTS.map((h) => (
                        <option key={h} value={h}>
                          {HINT_LABEL[h]}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                    {e.book} U{e.unit_no}
                    {e.marker === "star" ? " *" : e.marker === "box" ? " □" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {total > preview.length && (
              <p className="py-2 text-center text-xs text-[var(--color-muted)]">
                仅显示前 {preview.length} 条，PDF 会包含全部 {total} 条
              </p>
            )}
          </div>
        </Panel>

        {msg && (
          <div
            className={cn(
              "shrink-0 rounded-lg border px-3 py-2 text-xs",
              msg.ok
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-red-400/60 bg-red-500/10",
            )}
          >
            {msg.text}
          </div>
        )}
      </main>
    </div>
  );
}
