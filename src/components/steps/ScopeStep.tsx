import { Alert, Divider, Group, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { Info } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { OptionTile, PickerField } from "../../components/PickerField";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MARKERS = [
  { value: "none", label: "普通词", desc: "教材里没有符号，必修要求掌握" },
  { value: "star", label: "加星 *", desc: "教材标注为不作要求" },
  { value: "box", label: "方框 □", desc: "选择性必修单词" },
];

const KINDS = [
  { value: "word", label: "单词", desc: "有音标" },
  { value: "phrase", label: "短语", desc: "词组搭配，没有音标" },
];

/** 多选集合的通用切换 */
function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

type Kind = "word" | "phrase";

export function ScopeStep({ quiz }: { quiz: Quiz }) {
  // ── 摘要文案：不点开也能看清选了什么 ──
  const bookSummary =
    quiz.bookIds.length === 0
      ? "点击选择教材"
      : quiz.bookIds.length === quiz.books.length
        ? `全部 ${quiz.books.length} 册`
        : quiz.bookIds
            .map((id) => quiz.books.find((b) => b.id === id)?.volume ?? id)
            .join("、");

  const unitSummary =
    quiz.units.length === 0 ? "全部单元" : `UNIT ${[...quiz.units].sort((a, b) => a - b).join("、")}`;

  const initialSummary =
    quiz.initials.length === 0
      ? "不限首字母"
      : quiz.initials.map((c) => c.toUpperCase()).sort().join(" ");

  const markerSummary =
    quiz.markers.length === 0
      ? "三种都要"
      : MARKERS.filter((m) => quiz.markers.includes(m.value))
          .map((m) => m.label)
          .join("、");

  const kindSummary =
    quiz.kinds.length === 0
      ? "单词和短语都要"
      : KINDS.filter((k) => quiz.kinds.includes(k.value as Kind))
          .map((k) => k.label)
          .join("、");

  const pages = quiz.pagesText
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pageSummary = pages.length === 0 ? "不限页码" : quiz.pagesText;

  const resetFilters = () => {
    quiz.setUnits([]);
    quiz.setInitials([]);
    quiz.setMarkers([]);
    quiz.setKinds([]);
    quiz.setPagesText("");
    quiz.setQuery("");
  };

  return (
    <Stack gap="lg">
      <PickerField
        label="教材"
        help={HELP.books}
        required
        summary={bookSummary}
        empty={quiz.bookIds.length === 0}
        onClear={() => {
          quiz.setBookIds([]);
          quiz.setUnits([]);
          quiz.setInitials([]);
        }}
      >
        {(close) => (
          <Stack gap="sm">
            <SimpleGrid cols={1} spacing="xs">
              {quiz.books.map((b) => (
                <OptionTile
                  key={b.id}
                  selected={quiz.bookIds.includes(b.id)}
                  title={b.volume || b.title}
                  subtitle={`${b.total} 个词条 · ${b.units.length} 个单元`}
                  onClick={() => {
                    const next = toggle(quiz.bookIds, b.id);
                    quiz.setBookIds(next);
                    quiz.setUnits([]);
                    quiz.setInitials([]);
                  }}
                />
              ))}
            </SimpleGrid>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                已选 {quiz.bookIds.length} 本
              </Text>
              <Group gap="xs">
                <Text
                  size="sm"
                  c="brand.6"
                  style={{ cursor: "pointer" }}
                  onClick={() => quiz.setBookIds(quiz.books.map((b) => b.id))}
                >
                  全选
                </Text>
                <Text
                  size="sm"
                  c="dimmed"
                  style={{ cursor: "pointer" }}
                  onClick={close}
                >
                  收起
                </Text>
              </Group>
            </Group>
          </Stack>
        )}
      </PickerField>

      {quiz.bookIds.length === 0 && (
        <Alert color="yellow" variant="light" icon={<Info size={18} />}>
          至少选一本书才能出题
        </Alert>
      )}

      <Divider />

      <PickerField
        label="单元"
        help={HELP.units}
        summary={unitSummary}
        empty={false}
      >
        {() => (
          <Stack gap="sm">
            <SimpleGrid cols={3} spacing="xs">
              {quiz.allUnits.map((u) => (
                <OptionTile
                  key={u}
                  selected={quiz.units.includes(u)}
                  title={`UNIT ${u}`}
                  onClick={() => quiz.setUnits(toggle(quiz.units, u))}
                />
              ))}
            </SimpleGrid>
            {quiz.allUnits.length === 0 && (
              <Text size="sm" c="dimmed">
                先选教材
              </Text>
            )}
            <Group justify="space-between">
              <Text
                size="sm"
                c="brand.6"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  quiz.setUnits(quiz.units.length === quiz.allUnits.length ? [] : quiz.allUnits)
                }
              >
                {quiz.units.length === quiz.allUnits.length ? "全不选" : "全选"}
              </Text>
              <Text size="sm" c="dimmed">
                已选 {quiz.units.length} 个
              </Text>
            </Group>
          </Stack>
        )}
      </PickerField>

      <PickerField
        label="首字母"
        help={HELP.initials}
        summary={initialSummary}
        empty={false}
      >
        {() => (
          <Stack gap="sm">
            <SimpleGrid cols={6} spacing="xs">
              {quiz.allInitials.map(([ch]) => (
                <OptionTile
                  key={ch}
                  selected={quiz.initials.includes(ch)}
                  title={ch.toUpperCase()}
                  onClick={() => quiz.setInitials(toggle(quiz.initials, ch))}
                />
              ))}
            </SimpleGrid>
            <Group justify="space-between">
              <Text
                size="sm"
                c="brand.6"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  quiz.setInitials(
                    quiz.initials.length === quiz.allInitials.length
                      ? []
                      : quiz.allInitials.map(([c]) => c),
                  )
                }
              >
                {quiz.initials.length === quiz.allInitials.length ? "全不选" : "全选"}
              </Text>
              <Text size="sm" c="dimmed">
                已选 {quiz.initials.length} 个
              </Text>
            </Group>
          </Stack>
        )}
      </PickerField>

      <PickerField
        label="词汇标记"
        help={HELP.markers}
        summary={markerSummary}
        empty={false}
      >
        {() => (
          <Stack gap="sm">
            <SimpleGrid cols={1} spacing="xs">
              {MARKERS.map((m) => (
                <OptionTile
                  key={m.value}
                  selected={quiz.markers.includes(m.value)}
                  title={m.label}
                  subtitle={
                    quiz.markerCount[m.value]
                      ? `${m.desc} · ${quiz.markerCount[m.value]} 条`
                      : m.desc
                  }
                  onClick={() => quiz.setMarkers(toggle(quiz.markers, m.value))}
                />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              都不选 = 三种都要
            </Text>
          </Stack>
        )}
      </PickerField>

      <PickerField
        label="词条类型"
        help={HELP.kinds}
        summary={kindSummary}
        empty={false}
      >
        {() => (
          <Stack gap="sm">
            <SimpleGrid cols={2} spacing="xs">
              {KINDS.map((k) => (
                <OptionTile
                  key={k.value}
                  selected={quiz.kinds.includes(k.value as Kind)}
                  title={k.label}
                  subtitle={k.desc}
                  onClick={() => quiz.setKinds(toggle(quiz.kinds, k.value as Kind))}
                />
              ))}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              都不选 = 两种都要
            </Text>
          </Stack>
        )}
      </PickerField>

      <PickerField
        label="页码"
        help={HELP.pages}
        summary={pageSummary}
        empty={pages.length === 0}
        onClear={() => quiz.setPagesText("")}
      >
        {() => (
          <Stack gap="sm">
            <TextInput
              placeholder="也可以手打，如 12, 15-20"
              value={quiz.pagesText}
              onChange={(e) => quiz.setPagesText(e.currentTarget.value)}
            />
            <SimpleGrid cols={5} spacing="xs">
              {quiz.allPages.map((p) => (
                <OptionTile
                  key={p}
                  selected={quiz.pagesText.split(/[,，\s]+/).includes(String(p))}
                  title={String(p)}
                  onClick={() => {
                    const cur = quiz.pagesText
                      .split(/[,，\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const has = cur.includes(String(p));
                    const next = has
                      ? cur.filter((x) => x !== String(p))
                      : [...cur, String(p)];
                    quiz.setPagesText(next.join(", "));
                  }}
                />
              ))}
            </SimpleGrid>
          </Stack>
        )}
      </PickerField>

      <Divider />

      <TextInput
        label={<LabelRow text="指定单词" help={HELP.query} optional />}
        placeholder="mood, campus, senior"
        value={quiz.query}
        onChange={(e) => quiz.setQuery(e.currentTarget.value)}
        description="按名字搜索，支持部分匹配"
      />

      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          命中{" "}
          <Text span fw={700} c="brand.6" fz="md">
            {quiz.total}
          </Text>{" "}
          条
        </Text>
        {quiz.total === 0 && (
          <Text size="sm" c="brand.6" style={{ cursor: "pointer" }} onClick={resetFilters}>
            清空筛选
          </Text>
        )}
      </Group>
    </Stack>
  );
}
