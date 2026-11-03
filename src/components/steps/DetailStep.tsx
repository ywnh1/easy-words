import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Chip,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { LabelRow } from "../../components/LabelRow";
import { FIELD_LABEL, HINT_LABEL, type Field, type Hint } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const ALL_FIELDS: Field[] = ["word", "phonetic", "meaning", "blank"];
const ALL_HINTS: Hint[] = ["none", "zh", "en", "phonetic", "initial"];

/** 四选 n 的列配置：勾选哪几列 + 调整顺序。 */
function ColumnsDetail({ quiz }: { quiz: Quiz }) {
  const move = (i: number, to: number) => {
    if (to < 0 || to >= quiz.fields.length) return;
    const next = [...quiz.fields];
    const [v] = next.splice(i, 1);
    next.splice(to, 0, v);
    quiz.setFields(next);
  };

  return (
    <Stack gap="md">
      <div>
        <LabelRow text="显示哪些列" help={HELP.columns} required />
        <Paper withBorder radius="sm" mt={6}>
          <Table verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Tbody>
              {quiz.fields.map((f, i) => (
                <Table.Tr key={f}>
                  <Table.Td w={34}>
                    <Checkbox
                      checked
                      onChange={() => quiz.setFields(quiz.fields.filter((x) => x !== f))}
                      aria-label={`显示${FIELD_LABEL[f]}列`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{FIELD_LABEL[f]}</Text>
                  </Table.Td>
                  <Table.Td w={72}>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                        aria-label="上移"
                      >
                        ↑
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        disabled={i === quiz.fields.length - 1}
                        onClick={() => move(i, i + 1)}
                        aria-label="下移"
                      >
                        ↓
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>

        <Group gap={6} mt="xs">
          {ALL_FIELDS.filter((f) => !quiz.fields.includes(f)).map((f) => (
            <Button
              key={f}
              size="compact-xs"
              variant="light"
              onClick={() => quiz.setFields([...quiz.fields, f])}
            >
              + {FIELD_LABEL[f]}
            </Button>
          ))}
        </Group>
      </div>

      {!quiz.fields.includes("blank") && (
        <Alert color="blue" variant="light" title="没有「默写」列">
          这份卷子只作对照表用，不会生成答案页。需要答案就加一列「默写」。
        </Alert>
      )}
    </Stack>
  );
}

/** 句子默写：全局提示方式。 */
function SentenceDetail({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      <Select
        label={<LabelRow text="提示方式" help={HELP.hint} required />}
        value={quiz.hint}
        onChange={(v) => quiz.setHint((v as Hint) ?? "zh")}
        data={ALL_HINTS.map((h) => ({ value: h, label: HINT_LABEL[h] }))}
        allowDeselect={false}
        description="下一步的预览列表里，可以给单个词单独改提示"
      />

      {Object.keys(quiz.overrides).length > 0 && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            已为 {Object.keys(quiz.overrides).length} 个词单独设置
          </Text>
          <Button size="compact-xs" variant="subtle" onClick={() => quiz.setOverrides({})}>
            全部恢复全局
          </Button>
        </Group>
      )}

      <Alert color="gray" variant="light">
        每个词取它的第一条例句挖空；没有例句的词会自动跳过，不占题号。
      </Alert>
    </Stack>
  );
}

/** 选词填空：N 个考察短语 + M 个干扰。 */
function ClozeDetail({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      <NumberInput
        label={<LabelRow text="N · 考察短语数" help={HELP.clozeN} required />}
        value={quiz.clozeN}
        onChange={(v) => quiz.setClozeN(Math.max(1, Number(v) || 1))}
        min={1}
        max={40}
        description="也是句子数量"
      />
      <NumberInput
        label={<LabelRow text="M · 干扰选项数" help={HELP.clozeM} optional />}
        value={quiz.clozeM}
        onChange={(v) => quiz.setClozeM(Math.max(0, Number(v) || 0))}
        min={0}
        max={40}
        description="M 越大越难"
      />

      <Paper bg="var(--mantine-color-default-hover)" p="sm" radius="sm">
        <Text size="xs" c="dimmed">
          方框里共 <b>{quiz.clozeN + quiz.clozeM}</b> 个选项（{quiz.clozeN} 个答案 +{" "}
          {quiz.clozeM} 个干扰），下面 <b>{quiz.clozeN}</b> 个句子。
          {quiz.total < quiz.clozeN + quiz.clozeM && (
            <> 当前只命中 {quiz.total} 条，选项会不足，建议回上一步放宽条件。</>
          )}
        </Text>
      </Paper>
    </Stack>
  );
}

/** 笔记模式：附哪些例句。 */
function NotesDetail({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      <div>
        <LabelRow text="例句来源" help={HELP.exampleSources} optional />
        <Chip.Group
          multiple
          value={quiz.exampleSources}
          onChange={(v) => quiz.setExampleSources(v)}
        >
          <Group gap={6} mt={6}>
            <Chip value="oxford" size="sm" variant="light">
              牛津
            </Chip>
            <Chip value="collins" size="sm" variant="light">
              柯林斯
            </Chip>
            <Chip value="own" size="sm" variant="light">
              自撰
            </Chip>
          </Group>
        </Chip.Group>
      </div>

      <Alert color="blue" variant="light" title="笔记模式没有答案页">
        它是给整理复习用的：英文、音标、多来源中文、例句全列出来。
      </Alert>
    </Stack>
  );
}

export function DetailStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      {quiz.mode === "columns" && <ColumnsDetail quiz={quiz} />}
      {quiz.mode === "sentence" && <SentenceDetail quiz={quiz} />}
      {quiz.mode === "cloze" && <ClozeDetail quiz={quiz} />}
      {quiz.mode === "notes" && <NotesDetail quiz={quiz} />}
    </Stack>
  );
}
