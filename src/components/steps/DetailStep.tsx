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
  Text,
} from "@mantine/core";
import { CaretDown, CaretUp, Info, Plus } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { FIELD_LABEL, HINT_LABEL, type Field, type Hint } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const ALL_FIELDS: Field[] = ["word", "phonetic", "meaning", "blank"];
const ALL_HINTS: Hint[] = ["none", "zh", "en", "phonetic", "initial"];

/** 四选 n 的列配置：哪些列、什么顺序。 */
function ColumnsDetail({ quiz }: { quiz: Quiz }) {
  const move = (i: number, to: number) => {
    if (to < 0 || to >= quiz.fields.length) return;
    const next = [...quiz.fields];
    const [v] = next.splice(i, 1);
    next.splice(to, 0, v);
    quiz.setFields(next);
  };

  const missing = ALL_FIELDS.filter((f) => !quiz.fields.includes(f));

  return (
    <Stack gap="lg">
      <div>
        <LabelRow text="显示哪些列" help={HELP.columns} required />
        <Text size="sm" c="dimmed" mt={2} mb={8}>
          从上到下的顺序就是表格里从左到右的顺序
        </Text>

        <Stack gap={8}>
          {quiz.fields.map((f, i) => (
            <Paper key={f} withBorder radius="md" px="sm" py={6}>
              <Group gap="sm" wrap="nowrap">
                <Checkbox
                  checked
                  onChange={() => quiz.setFields(quiz.fields.filter((x) => x !== f))}
                  aria-label={`去掉${FIELD_LABEL[f]}列`}
                />
                <Text size="md" style={{ flex: 1 }}>
                  {FIELD_LABEL[f]}
                </Text>
                <Group gap={0} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    aria-label="上移"
                  >
                    <CaretUp size={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    disabled={i === quiz.fields.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label="下移"
                  >
                    <CaretDown size={18} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>

        {missing.length > 0 && (
          <Group gap={8} mt="sm">
            {missing.map((f) => (
              <Button
                key={f}
                size="compact-sm"
                variant="light"
                leftSection={<Plus size={15} weight="bold" />}
                onClick={() => quiz.setFields([...quiz.fields, f])}
              >
                {FIELD_LABEL[f]}
              </Button>
            ))}
          </Group>
        )}
      </div>

      {!quiz.fields.includes("blank") && (
        <Alert color="blue" variant="light" icon={<Info size={18} />}>
          没有「默写」列，这份卷子只作对照表用，不会生成答案页。
        </Alert>
      )}
    </Stack>
  );
}

/** 句子默写：全局提示方式。 */
function SentenceDetail({ quiz }: { quiz: Quiz }) {
  const overrideCount = Object.keys(quiz.overrides).length;

  return (
    <Stack gap="lg">
      <Select
        label={<LabelRow text="提示方式" help={HELP.hint} required />}
        value={quiz.hint}
        onChange={(v) => quiz.setHint((v as Hint) ?? "zh")}
        data={ALL_HINTS.map((h) => ({ value: h, label: HINT_LABEL[h] }))}
        allowDeselect={false}
        description="下一步的预览里，可以给单个词单独改"
      />

      {overrideCount > 0 && (
        <Paper withBorder radius="md" p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" c="dimmed">
              已为 {overrideCount} 个词单独设置
            </Text>
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              onClick={() => quiz.setOverrides({})}
            >
              全部恢复
            </Button>
          </Group>
        </Paper>
      )}

      <Alert color="gray" variant="light" icon={<Info size={18} />}>
        每个词取它的第一条例句挖空；没有例句的词会跳过，不占题号。
      </Alert>
    </Stack>
  );
}

/** 选词填空：N 个考察短语 + M 个干扰。 */
function ClozeDetail({ quiz }: { quiz: Quiz }) {
  const short = quiz.total < quiz.clozeN + quiz.clozeM;

  return (
    <Stack gap="lg">
      <NumberInput
        label={<LabelRow text="N · 考察短语数" help={HELP.clozeN} required />}
        value={quiz.clozeN}
        onChange={(v) => quiz.setClozeN(Math.max(1, Number(v) || 1))}
        min={1}
        max={40}
        suffix=" 个"
        description="也是句子数量"
      />
      <NumberInput
        label={<LabelRow text="M · 干扰选项数" help={HELP.clozeM} optional />}
        value={quiz.clozeM}
        onChange={(v) => quiz.setClozeM(Math.max(0, Number(v) || 0))}
        min={0}
        max={40}
        suffix=" 个"
        description="M 越大越难"
      />

      <Paper withBorder radius="md" p="md">
        <Stack gap={4}>
          <Group gap={4}>
            <Text size="xl" fw={700} c="brand.6" style={{ fontVariantNumeric: "tabular-nums" }}>
              {quiz.clozeN + quiz.clozeM}
            </Text>
            <Text size="sm" c="dimmed">
              个选项
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {quiz.clozeN} 个答案 + {quiz.clozeM} 个干扰，下面出 {quiz.clozeN} 个句子
          </Text>
        </Stack>
      </Paper>

      {short && (
        <Alert color="yellow" variant="light" icon={<Info size={18} />}>
          当前只命中 {quiz.total} 条，选项会不足。回上一步放宽范围，或调小 N/M。
        </Alert>
      )}
    </Stack>
  );
}

/** 笔记模式：附哪些例句。 */
function NotesDetail({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="lg">
      <div>
        <LabelRow text="例句来源" help={HELP.exampleSources} optional />
        <Chip.Group
          multiple
          value={quiz.exampleSources}
          onChange={quiz.setExampleSources}
        >
          <Group gap={8} mt={8}>
            <Chip value="oxford" variant="light" radius="md">
              牛津
            </Chip>
            <Chip value="collins" variant="light" radius="md">
              柯林斯
            </Chip>
            <Chip value="own" variant="light" radius="md">
              自撰
            </Chip>
          </Group>
        </Chip.Group>
        <Text size="sm" c="dimmed" mt={6}>
          都不选就只列词条和释义
        </Text>
      </div>

      <Alert color="blue" variant="light" icon={<Info size={18} />}>
        笔记模式是整理复习用的：英文、音标、多来源中文、例句全列出来，没有答案页。
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
