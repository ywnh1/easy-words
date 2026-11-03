import {
  Alert,
  Anchor,
  Chip,
  Group,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { LabelRow } from "../../components/LabelRow";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MARKER_OPTIONS = [
  { value: "none", label: "普通词" },
  { value: "star", label: "加星 *" },
  { value: "box", label: "方框 □" },
];

export function ScopeStep({ quiz }: { quiz: Quiz }) {
  const bookOptions = quiz.books.map((b) => ({
    value: b.id,
    label: `${b.volume || b.title}（${b.total}）`,
  }));

  return (
    <Stack gap="lg">
      <MultiSelect
        label={
          <LabelRow text="教材" help={HELP.books} required />
        }
        placeholder={quiz.bookIds.length ? undefined : "选择至少一本书"}
        data={bookOptions}
        value={quiz.bookIds}
        onChange={(v) => {
          quiz.setBookIds(v);
          quiz.setUnits([]);
          quiz.setInitials([]);
        }}
        description="可多选；后两步的筛选都在这几本书之内"
        searchable={false}
        hidePickedOptions={false}
        nothingFoundMessage="没有可选的教材"
        required
      />

      {quiz.bookIds.length === 0 && (
        <Alert color="yellow" variant="light" title="还没选教材">
          至少选一本书才能出题。上面选好之后，「下一步」才会亮起。
        </Alert>
      )}

      <div>
        <LabelRow text="单元" help={HELP.units} optional />
        <Chip.Group multiple value={quiz.units.map(String)} onChange={(v) => quiz.setUnits(v.map(Number))}>
          <Group gap={6} mt={6}>
            {quiz.allUnits.map((u) => (
              <Chip key={u} value={String(u)} size="sm" variant="light">
                UNIT {u}
              </Chip>
            ))}
            {quiz.allUnits.length === 0 && (
              <Text size="xs" c="dimmed">
                先选教材
              </Text>
            )}
          </Group>
        </Chip.Group>
      </div>

      <TextInput
        label={<LabelRow text="页码" help={HELP.pages} optional />}
        placeholder="例如 12, 15-20"
        value={quiz.pagesText}
        onChange={(e) => quiz.setPagesText(e.currentTarget.value)}
        description="支持单个页码与区间，逗号或空格分隔；留空表示不限"
      />

      <div>
        <LabelRow text="首字母" help={HELP.initials} optional />
        <Chip.Group
          multiple
          value={quiz.initials}
          onChange={(v) => quiz.setInitials(v)}
        >
          <Group gap={4} mt={6}>
            {quiz.allInitials.map(([ch]) => (
              <Chip key={ch} value={ch} size="xs" variant="light" tt="uppercase" radius="sm">
                {ch}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>

      <div>
        <LabelRow text="词汇标记" help={HELP.markers} optional />
        <Chip.Group
          multiple
          value={quiz.markers}
          onChange={(v) => quiz.setMarkers(v)}
        >
          <Group gap={6} mt={6}>
            {MARKER_OPTIONS.map((o) => (
              <Chip key={o.value} value={o.value} size="sm" variant="light">
                {o.label}
                {quiz.markerCount[o.value] ? (
                  <Text span size="xs" c="dimmed" ml={4}>
                    {quiz.markerCount[o.value]}
                  </Text>
                ) : null}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </div>

      <div>
        <LabelRow text="词条类型" help={HELP.kinds} optional />
        <Chip.Group
          multiple
          value={quiz.kinds}
          onChange={(v) => quiz.setKinds(v as ("word" | "phrase")[])}
        >
          <Group gap={6} mt={6}>
            <Chip value="word" size="sm" variant="light">
              只单词
            </Chip>
            <Chip value="phrase" size="sm" variant="light">
              只短语
            </Chip>
          </Group>
        </Chip.Group>
      </div>

      <TextInput
        label={<LabelRow text="指定单词" help={HELP.query} optional />}
        placeholder="mood, campus, senior"
        value={quiz.query}
        onChange={(e) => quiz.setQuery(e.currentTarget.value)}
        description="逗号或换行分隔，支持部分匹配；留空表示不额外限制"
      />

      <Text size="xs" c="dimmed">
        当前条件命中 <b>{quiz.total}</b> 条
        {quiz.total === 0 && (
          <>
            {" —— "}
            <Anchor component="button" type="button" size="xs" onClick={() => {
              quiz.setUnits([]);
              quiz.setInitials([]);
              quiz.setMarkers([]);
              quiz.setKinds([]);
              quiz.setPagesText("");
              quiz.setQuery("");
            }}>
              清空筛选
            </Anchor>
          </>
        )}
      </Text>
    </Stack>
  );
}
