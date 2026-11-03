import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button, Check, Chip, Panel, Select, TextInput } from "./components/ui";
import { cn } from "./lib/cn";
import type { BookInfo, EntryView, ExportResult, Filter, Hint, Kind } from "./lib/types";

const KIND_LABEL: Record<Kind, string> = {
  cn2_en: "中译英",
  en2_cn: "英译中",
  table: "单词表",
  blank: "句子默写",
};

const KIND_DESC: Record<Kind, string> = {
  cn2_en: "给中文，默写英文；不给音标。",
  en2_cn: "给英文和音标，默写中文。",
  table: "英文 · 音标 · 中文三列，最后一列留空默写。",
  blank: "从例句里挖掉目标词，提示放在横线后面。",
};

const HINT_LABEL: Record<Hint, string> = {
  none: "不给提示",
  zh: "括号里中文",
  en: "括号里英文",
  initial: "首字母",
};

const MARKER_LABEL: Record<string, string> = {
  none: "普通词",
  star: "加星 *",
  box: "方框 □",
};

const SOURCE_LABEL: Record<string, string> = {
  textbook: "教材词表",
  extra: "扩充短语",
};

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

/** 逗号分隔输入的多选辅助 */
function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function App() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  const [bookIds, setBookIds] = useState<string[]>([]);
  const [units, setUnits] = useState<number[]>([]);
  const [pagesText, setPagesText] = useState("");
  const [initials, setInitials] = useState<string[]>([]);
  const [markers, setMarkers] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [shuffle, setShuffle] = useState(false);

  const [kind, setKind] = useState<Kind>("cn2_en");
  const [hint, setHint] = useState<Hint>("zh");
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

  const filter: Filter = useMemo(
    () => ({
      book_ids: bookIds,
      units,
      pages: parsePages(pagesText),
      initials,
      markers,
      sources,
      query,
      shuffle,
      needs_meaning: kind === "cn2_en" || kind === "table",
    }),
    [bookIds, units, pagesText, initials, markers, sources, query, shuffle, kind],
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
        invoke<EntryView[]>("preview", { filter, limit: 30 }),
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
  const withExamples = useMemo(
    () => selectedBooks.reduce((a, b) => a + b.with_examples, 0),
    [selectedBooks],
  );
  const grandTotal = useMemo(() => selectedBooks.reduce((a, b) => a + b.total, 0), [selectedBooks]);

  const subtitle = useMemo(() => {
    const names = selectedBooks.map((b) => b.volume || b.title).join("、") || "全部";
    const u = units.length ? ` · UNIT ${units.join(",")}` : "";
    return `${names}${u} · 共 ${total} 题`;
  }, [selectedBooks, units, total]);

  const doExport = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await invoke<ExportResult>("export_pdf", {
        filter,
        spec: {
          kind,
          hint: kind === "blank" ? hint : undefined,
          answer_key: answerKey,
          title: title.trim() || undefined,
          subtitle,
        },
      });
      setMsg({ ok: true, text: `已生成 ${res.count} 题 → ${res.path}` });
      try {
        await openPath(res.path);
      } catch {
        /* 打开失败不影响导出，路径已经告知用户 */
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }, [filter, kind, hint, answerKey, title, subtitle]);

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
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-3 p-3 lg:flex-row">
      {/* ── 左侧：筛选 ───────────────────────────────── */}
      <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto pb-2 lg:w-[340px]">
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
            {allUnits.length === 0 && <span className="text-xs text-[var(--color-muted)]">先选教材</span>}
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

        <Panel title="范围（空=不限）">
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
              指定单词
              <TextInput
                className="mt-1"
                placeholder="逗号或换行分隔；也支持 contain 匹配"
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
            {["textbook", "extra"].map((s) => (
              <Check
                key={s}
                checked={sources.includes(s)}
                onChange={() => setSources(toggle(sources, s))}
                label={SOURCE_LABEL[s]}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-muted)]">
            都不勾选 = 不限。勾选后只出所勾的类别。
          </p>
        </Panel>
      </aside>

      {/* ── 右侧：题型 + 预览 ─────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <Panel title="题型">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition",
                  kind === k
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-line)] hover:border-[var(--color-accent)]",
                )}
              >
                <div className="text-sm font-medium">{KIND_LABEL[k]}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">{KIND_DESC[kind]}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {kind === "blank" && (
              <label className="block text-xs text-[var(--color-muted)]">
                提示方式
                <div className="mt-1">
                  <Select
                    value={hint}
                    onChange={(v) => setHint(v as Hint)}
                    options={(Object.keys(HINT_LABEL) as Hint[]).map((h) => ({
                      value: h,
                      label: HINT_LABEL[h],
                    }))}
                  />
                </div>
                <span className="mt-1 block">
                  当前范围有例句 {Math.min(withExamples, total)} / {total} 条
                </span>
              </label>
            )}
            <label className="block text-xs text-[var(--color-muted)]">
              卷头标题（留空用默认）
              <TextInput
                className="mt-1"
                placeholder={KIND_LABEL[kind]}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Check checked={answerKey} onChange={setAnswerKey} label="附参考答案页" />
            <Check checked={shuffle} onChange={setShuffle} label="打乱顺序" />
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
          <div className="h-full max-h-[calc(100vh-320px)] overflow-y-auto thin-scroll">
            {grandTotal === 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">选择教材后显示词条</p>
            )}
            {total === 0 && grandTotal > 0 && (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                当前筛选没有命中，放宽条件试试
              </p>
            )}
            <ul className="divide-y divide-[var(--color-line)]">
              {preview.map((e, i) => (
                <li key={`${e.word}-${i}`} className="flex items-baseline gap-2.5 py-1.5 text-sm">
                  <span className="w-6 shrink-0 text-right text-xs text-[var(--color-muted)]">
                    {i + 1}
                  </span>
                  <span className="shrink-0 font-medium">{e.word}</span>
                  {e.phonetic && (
                    <span className="shrink-0 text-xs text-[var(--color-muted)]">{e.phonetic}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{e.meaning}</span>
                  <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                    {e.book} U{e.unit_no}
                    {e.marker !== "none" && (e.marker === "star" ? " *" : " □")}
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
