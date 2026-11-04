import {
  Alert,
  Anchor,
  Chip,
  Divider,
  Group,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Info } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MARKERS = [
  { value: "none", label: "普通词" },
  { value: "star", label: "加星 *" },
  { value: "box", label: "方框 □" },
];

/** 一组配置：小标题 + 控件。组与组之间用 Divider 断开。 */
function Field({
  label,
  help,
  required,
  optional,
  children,
}: {
  label: string;
  help: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <LabelRow text={label} help={help} required={required} optional={optional} />
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export function ScopeStep({ quiz }: { quiz: Quiz }) {
  const bookOptions = quiz.books.map((b) => ({
    value: b.id,
    label: `${b.volume || b.title} · ${b.total} 词`,
  }));

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
      <MultiSelect
        label={<LabelRow text="教材" help={HELP.books} required />}
        placeholder={quiz.bookIds.length ? undefined : "点这里选一本或多本"}
        data={bookOptions}
        value={quiz.bookIds}
        onChange={(v) => {
          quiz.setBookIds(v);
          quiz.setUnits([]);
          quiz.setInitials([]);
        }}
        searchable={false}
        hidePickedOptions={false}
        nothingFoundMessage="没有可选的教材"
        required
      />

      {quiz.bookIds.length === 0 && (
        <Alert color="yellow" variant="light" icon={<Info size={18} />}>
          至少选一本书才能出题
        </Alert>
      )}

      <Divider />

      <Field label="单元" help={HELP.units} optional>
        <Chip.Group
          multiple
          value={quiz.units.map(String)}
          onChange={(v) => quiz.setUnits(v.map(Number))}
        >
          <Group gap={8}>
            {quiz.allUnits.map((u) => (
              <Chip key={u} value={String(u)} variant="light" radius="md">
                {u}
              </Chip>
            ))}
            {quiz.allUnits.length === 0 && (
              <Text size="sm" c="dimmed">
                先选教材
              </Text>
            )}
          </Group>
        </Chip.Group>
      </Field>

      <Field label="首字母" help={HELP.initials} optional>
        <Chip.Group multiple value={quiz.initials} onChange={quiz.setInitials}>
          <Group gap={6}>
            {quiz.allInitials.map(([ch]) => (
              <Chip
                key={ch}
                value={ch}
                variant="light"
                radius="md"
                tt="uppercase"
                styles={{
                  label: { paddingInline: 0, minWidth: 40, justifyContent: "center" },
                }}
              >
                {ch}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Field>

      <Field label="词汇标记" help={HELP.markers} optional>
        <Chip.Group multiple value={quiz.markers} onChange={quiz.setMarkers}>
          <Group gap={8}>
            {MARKERS.map((m) => (
              <Chip key={m.value} value={m.value} variant="light" radius="md">
                {m.label}
                {quiz.markerCount[m.value] ? ` · ${quiz.markerCount[m.value]}` : ""}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Field>

      <Field label="词条类型" help={HELP.kinds} optional>
        <Chip.Group
          multiple
          value={quiz.kinds}
          onChange={(v) => quiz.setKinds(v as ("word" | "phrase")[])}
        >
          <Group gap={8}>
            <Chip value="word" variant="light" radius="md">
              只单词
            </Chip>
            <Chip value="phrase" variant="light" radius="md">
              只短语
            </Chip>
          </Group>
        </Chip.Group>
      </Field>

      <Divider />

      <TextInput
        label={<LabelRow text="页码" help={HELP.pages} optional />}
        placeholder="12, 15-20"
        value={quiz.pagesText}
        onChange={(e) => quiz.setPagesText(e.currentTarget.value)}
      />

      <TextInput
        label={<LabelRow text="指定单词" help={HELP.query} optional />}
        placeholder="mood, campus, senior"
        value={quiz.query}
        onChange={(e) => quiz.setQuery(e.currentTarget.value)}
      />

      <Text size="sm" c="dimmed">
        当前条件命中{" "}
        <Text span fw={700} c="brand.6">
          {quiz.total}
        </Text>{" "}
        条
        {quiz.total === 0 && (
          <>
            {" · "}
            <Anchor component="button" type="button" size="sm" onClick={resetFilters}>
              清空筛选
            </Anchor>
          </>
        )}
      </Text>
    </Stack>
  );
}
