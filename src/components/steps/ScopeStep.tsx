import { Box, Callout, Flex, Grid, Separator, Text, TextField } from "@radix-ui/themes";
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

type Kind = "word" | "phrase";

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function ScopeStep({ quiz }: { quiz: Quiz }) {
  const bookSummary =
    quiz.bookIds.length === 0
      ? "点击选择教材"
      : quiz.bookIds.length === quiz.books.length
        ? `全部 ${quiz.books.length} 册`
        : quiz.bookIds
            .map((id) => quiz.books.find((b) => b.id === id)?.volume ?? id)
            .join("、");

  const unitSummary =
    quiz.units.length === 0
      ? "全部单元"
      : `UNIT ${[...quiz.units].sort((a, b) => a - b).join("、")}`;

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
    <Flex direction="column" gap="5">
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
        {() => (
          <Flex direction="column" gap="3">
            <Grid columns="1" gap="2">
              {quiz.books.map((b) => (
                <OptionTile
                  key={b.id}
                  selected={quiz.bookIds.includes(b.id)}
                  title={b.volume || b.title}
                  subtitle={`${b.total} 个词条 · ${b.units.length} 个单元`}
                  onClick={() => {
                    quiz.setBookIds(toggle(quiz.bookIds, b.id));
                    quiz.setUnits([]);
                    quiz.setInitials([]);
                  }}
                />
              ))}
            </Grid>
            <Flex justify="between">
              <Text size="1" color="gray">
                已选 {quiz.bookIds.length} 本
              </Text>
              <Text
                size="1"
                color="blue"
                role="button"
                style={{ cursor: "pointer" }}
                onClick={() => quiz.setBookIds(quiz.books.map((b) => b.id))}
              >
                全选
              </Text>
            </Flex>
          </Flex>
        )}
      </PickerField>

      {quiz.bookIds.length === 0 && (
        <Callout.Root color="amber" size="2">
          <Callout.Icon>
            <Info size={17} />
          </Callout.Icon>
          <Callout.Text>至少选一本书才能出题</Callout.Text>
        </Callout.Root>
      )}

      <Separator size="4" />

      <PickerField label="单元" help={HELP.units} summary={unitSummary}>
        {() => (
          <Flex direction="column" gap="3">
            {quiz.allUnits.length === 0 ? (
              <Text size="2" color="gray">
                先选教材
              </Text>
            ) : (
              <Grid columns="3" gap="2">
                {quiz.allUnits.map((u) => (
                  <OptionTile
                    key={u}
                    selected={quiz.units.includes(u)}
                    title={`UNIT ${u}`}
                    onClick={() => quiz.setUnits(toggle(quiz.units, u))}
                  />
                ))}
              </Grid>
            )}
            <Flex justify="between">
              <Text
                size="1"
                color="blue"
                role="button"
                style={{ cursor: "pointer" }}
                onClick={() =>
                  quiz.setUnits(quiz.units.length === quiz.allUnits.length ? [] : quiz.allUnits)
                }
              >
                {quiz.units.length === quiz.allUnits.length ? "全不选" : "全选"}
              </Text>
              <Text size="1" color="gray">
                已选 {quiz.units.length} 个
              </Text>
            </Flex>
          </Flex>
        )}
      </PickerField>

      <PickerField label="首字母" help={HELP.initials} summary={initialSummary}>
        {() => (
          <Flex direction="column" gap="3">
            <Grid columns="6" gap="2">
              {quiz.allInitials.map(([ch]) => (
                <OptionTile
                  key={ch}
                  selected={quiz.initials.includes(ch)}
                  title={ch.toUpperCase()}
                  onClick={() => quiz.setInitials(toggle(quiz.initials, ch))}
                />
              ))}
            </Grid>
            <Flex justify="between">
              <Text
                size="1"
                color="blue"
                role="button"
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
              <Text size="1" color="gray">
                已选 {quiz.initials.length} 个
              </Text>
            </Flex>
          </Flex>
        )}
      </PickerField>

      <PickerField label="词汇标记" help={HELP.markers} summary={markerSummary}>
        {() => (
          <Flex direction="column" gap="3">
            <Grid columns="1" gap="2">
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
            </Grid>
            <Text size="1" color="gray">
              都不选 = 三种都要
            </Text>
          </Flex>
        )}
      </PickerField>

      <PickerField label="词条类型" help={HELP.kinds} summary={kindSummary}>
        {() => (
          <Flex direction="column" gap="3">
            <Grid columns="2" gap="2">
              {KINDS.map((k) => (
                <OptionTile
                  key={k.value}
                  selected={quiz.kinds.includes(k.value as Kind)}
                  title={k.label}
                  subtitle={k.desc}
                  onClick={() => quiz.setKinds(toggle(quiz.kinds, k.value as Kind))}
                />
              ))}
            </Grid>
            <Text size="1" color="gray">
              都不选 = 两种都要
            </Text>
          </Flex>
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
          <Flex direction="column" gap="3">
            <TextField.Root
              placeholder="也可以手打，如 12, 15-20"
              value={quiz.pagesText}
              onChange={(e) => quiz.setPagesText(e.currentTarget.value)}
              size="3"
            />
            <Grid columns="5" gap="2">
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
                    const next = cur.includes(String(p))
                      ? cur.filter((x) => x !== String(p))
                      : [...cur, String(p)];
                    quiz.setPagesText(next.join(", "));
                  }}
                />
              ))}
            </Grid>
          </Flex>
        )}
      </PickerField>

      <Separator size="4" />

      <Box>
        <LabelRow text="指定单词" help={HELP.query} optional />
        <Box mt="2">
          <TextField.Root
            placeholder="mood, campus, senior"
            value={quiz.query}
            onChange={(e) => quiz.setQuery(e.currentTarget.value)}
            size="3"
          />
        </Box>
        <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
          按名字搜索，支持部分匹配
        </Text>
      </Box>

      <Flex justify="between" align="center">
        <Text size="2" color="gray">
          命中{" "}
          <Text size="3" weight="bold" color="blue">
            {quiz.total}
          </Text>{" "}
          条
        </Text>
        {quiz.total === 0 && (
          <Text
            size="2"
            color="blue"
            role="button"
            style={{ cursor: "pointer" }}
            onClick={resetFilters}
          >
            清空筛选
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
