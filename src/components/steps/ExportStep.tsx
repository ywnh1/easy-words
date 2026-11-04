import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { LabelRow } from "../../components/LabelRow";
import {
  FORMAT_LABEL,
  HINT_LABEL,
  SENSE_LABEL,
  type Format,
  type Hint,
  type SenseSource,
} from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const ALL_HINTS: Hint[] = ["none", "zh", "en", "phonetic", "initial"];

/** 中文来源：勾选参与 + 调整优先顺序。 */
function SenseOrder({ quiz }: { quiz: Quiz }) {
  const move = (i: number, to: number) => {
    if (to < 0 || to >= quiz.senseAll.length) return;
    const next = [...quiz.senseAll];
    const [v] = next.splice(i, 1);
    next.splice(to, 0, v);
    quiz.setSenseAll(next);
  };

  return (
    <div>
      <LabelRow text="中文释义来源" help={HELP.senseSources} required />
      <Text size="xs" c="dimmed" mt={2} mb={6}>
        排在前面的优先；这个词在该来源没有释义时自动用下一个
      </Text>
      <Paper withBorder radius="sm">
        <Table verticalSpacing="xs" horizontalSpacing="sm">
          <Table.Tbody>
            {quiz.senseAll.map((s: SenseSource, i) => (
              <Table.Tr key={s}>
                <Table.Td w={34}>
                  <Checkbox
                    checked={quiz.senseOn[s]}
                    onChange={(e) =>
                      quiz.setSenseOn({ ...quiz.senseOn, [s]: e.currentTarget.checked })
                    }
                    aria-label={`启用${SENSE_LABEL[s]}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={quiz.senseOn[s] ? undefined : "dimmed"}>
                    {i + 1}. {SENSE_LABEL[s]}
                  </Text>
                </Table.Td>
                <Table.Td w={64}>
                  <Group gap={0} justify="flex-end" wrap="nowrap">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      aria-label="上移"
                      px={6}
                    >
                      ↑
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      disabled={i === quiz.senseAll.length - 1}
                      onClick={() => move(i, i + 1)}
                      aria-label="下移"
                      px={6}
                    >
                      ↓
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </div>
  );
}

export function ExportStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="lg">
      <SenseOrder quiz={quiz} />

      <TextInput
        label={<LabelRow text="卷头标题" help={HELP.title} optional />}
        placeholder="留空则用题型名"
        value={quiz.title}
        onChange={(e) => quiz.setTitle(e.currentTarget.value)}
        description={`副标题自动生成：${quiz.subtitle}`}
      />

      {quiz.mode === "notes" ? (
        <Alert color="gray" variant="light" title="笔记模式固定没有答案页">
          它本身就是完整的对照材料。
        </Alert>
      ) : (
        <div>
          <LabelRow text="参考答案" help={HELP.answerKey} />
          <Switch
            mt={6}
            checked={quiz.answerKey}
            onChange={(e) => quiz.setAnswerKey(e.currentTarget.checked)}
            label="在卷子最后附一页答案"
            description={
              quiz.mode === "columns" && !quiz.fields.includes("blank")
                ? "当前没有「默写」列，即使打开也不会生成答案页"
                : undefined
            }
          />
        </div>
      )}

      <Divider />

      <div>
        <Group justify="space-between" align="center" mb={4}>
          <LabelRow text={`预览 · 命中 ${quiz.total} 条`} help={HELP.preview} />
        </Group>

        <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars>
          {quiz.preview.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="lg">
              {quiz.total === 0 ? "当前筛选没有命中，回上一步放宽条件" : "加载中…"}
            </Text>
          ) : (
            <Table verticalSpacing={4} horizontalSpacing="sm" fz="sm">
              <Table.Tbody>
                {quiz.preview.map((e, i) => {
                  const key = e.word.toLowerCase();
                  return (
                    <Table.Tr key={`${key}-${i}`}>
                      <Table.Td w={30} c="dimmed" fz="xs" ta="right">
                        {i + 1}
                      </Table.Td>
                      <Table.Td w="auto" style={{ whiteSpace: "nowrap" }}>
                        <Text span fw={500} size="sm">
                          {e.word}
                        </Text>
                        {e.phonetic && (
                          <Text span size="xs" c="dimmed" ml={6}>
                            {e.phonetic}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1}>
                          {e.meaning}
                        </Text>
                      </Table.Td>
                      {quiz.mode === "sentence" && (
                        <Table.Td w={96}>
                          <Select
                            size="xs"
                            value={quiz.overrides[key] ?? ""}
                            onChange={(v) => {
                              const next = { ...quiz.overrides };
                              if (!v) delete next[key];
                              else next[key] = v as Hint;
                              quiz.setOverrides(next);
                            }}
                            data={[
                              { value: "", label: "跟随全局" },
                              ...ALL_HINTS.map((h) => ({ value: h, label: HINT_LABEL[h] })),
                            ]}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                          />
                        </Table.Td>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </ScrollArea.Autosize>

        {quiz.total > quiz.preview.length && (
          <Text size="xs" c="dimmed" ta="center" mt={6}>
            仅显示前 {quiz.preview.length} 条，PDF 会包含全部 {quiz.total} 条
          </Text>
        )}
      </div>

      {quiz.msg && (
        <Alert
          color={quiz.msg.ok ? "green" : "red"}
          variant="light"
          onClose={() => quiz.setMsg(null)}
          withCloseButton
        >
          <Text size="xs" style={{ wordBreak: "break-all" }}>
            {quiz.msg.text}
          </Text>
        </Alert>
      )}

      <div>
        <LabelRow text="导出格式" help={HELP.format} />
        <SegmentedControl
          fullWidth
          mt={6}
          value={quiz.format}
          onChange={(v) => quiz.setFormat(v as Format)}
          data={[
            { value: "pdf", label: FORMAT_LABEL.pdf },
            { value: "docx", label: FORMAT_LABEL.docx },
          ]}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {quiz.format === "docx"
            ? "Word 文档可以直接在 WPS / Office 里改题、加减题，再打印。"
            : "PDF 版式固定，打印出来最整齐。"}
        </Text>
      </div>

      <Button
        size="md"
        fullWidth
        loading={quiz.busy}
        disabled={quiz.total === 0}
        onClick={() => quiz.doExport()}
      >
        生成 {FORMAT_LABEL[quiz.format]}
      </Button>
    </Stack>
  );
}
