import {
  ActionIcon,
  Alert,
  Checkbox,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { CaretDown, CaretUp, CheckCircle, Warning } from "@phosphor-icons/react";
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
      <Text size="sm" c="dimmed" mt={2} mb={8}>
        排在前面的优先，没有就自动用下一个
      </Text>

      <Stack gap={8}>
        {quiz.senseAll.map((s: SenseSource, i) => {
          const on = quiz.senseOn[s];
          return (
            <Paper
              key={s}
              withBorder
              radius="md"
              px="sm"
              py={6}
              style={{ opacity: on ? 1 : 0.55 }}
            >
              <Group gap="sm" wrap="nowrap">
                <Checkbox
                  checked={on}
                  onChange={(e) =>
                    quiz.setSenseOn({ ...quiz.senseOn, [s]: e.currentTarget.checked })
                  }
                  aria-label={`启用${SENSE_LABEL[s]}`}
                />
                <Text size="md" style={{ flex: 1 }} c={on ? undefined : "dimmed"}>
                  {SENSE_LABEL[s]}
                </Text>
                <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {i + 1}
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
                    disabled={i === quiz.senseAll.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label="下移"
                  >
                    <CaretDown size={18} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </div>
  );
}

/** 预览：卡片列表。手机上表格列会被挤成竖条，读不出东西。 */
function Preview({ quiz }: { quiz: Quiz }) {
  if (quiz.preview.length === 0) {
    return (
      <Paper withBorder radius="md" p="lg">
        <Text size="sm" c="dimmed" ta="center">
          {quiz.total === 0 ? "当前筛选没有命中，回上一步放宽条件" : "加载中…"}
        </Text>
      </Paper>
    );
  }

  return (
    <>
      <ScrollArea.Autosize mah={360} type="auto" offsetScrollbars>
        <Stack gap={6}>
          {quiz.preview.map((e, i) => {
            const key = e.word.toLowerCase();
            return (
              <Paper key={`${key}-${i}`} withBorder radius="sm" px="sm" py={8}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Text
                    size="xs"
                    c="dimmed"
                    w={20}
                    ta="right"
                    style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", paddingTop: 3 }}
                  >
                    {i + 1}
                  </Text>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="wrap">
                      <Text size="md" fw={600}>
                        {e.word}
                      </Text>
                      {e.phonetic && (
                        <Text size="sm" c="dimmed">
                          {e.phonetic}
                        </Text>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed" lineClamp={2} mt={2}>
                      {e.meaning}
                    </Text>
                  </div>
                  {quiz.mode === "sentence" && (
                    <Select
                      size="xs"
                      w={100}
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
                      style={{ flexShrink: 0 }}
                    />
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </ScrollArea.Autosize>

      {quiz.total > quiz.preview.length && (
        <Text size="sm" c="dimmed" ta="center" mt={8}>
          仅显示前 {quiz.preview.length} 条，导出会包含全部 {quiz.total} 条
        </Text>
      )}
    </>
  );
}

export function ExportStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="lg">
      {/* 导出格式放最前：这是最后一步，用户最关心的就是"导成什么" */}
      <div>
        <LabelRow text="导出格式" help={HELP.format} required />
        <SegmentedControl
          fullWidth
          mt={8}
          size="md"
          value={quiz.format}
          onChange={(v) => quiz.setFormat(v as Format)}
          data={[
            { value: "pdf", label: FORMAT_LABEL.pdf },
            { value: "docx", label: FORMAT_LABEL.docx },
          ]}
        />
        <Text size="sm" c="dimmed" mt={8}>
          {quiz.format === "docx"
            ? "Word 可以在 WPS / Office 里改题、加减条目，再打印。"
            : "PDF 版式固定，打印出来最整齐，但不好再改。"}
        </Text>
      </div>

      <Divider />

      <TextInput
        label={<LabelRow text="卷头标题" help={HELP.title} optional />}
        placeholder="留空则用题型名"
        value={quiz.title}
        onChange={(e) => quiz.setTitle(e.currentTarget.value)}
        description={`副标题自动生成：${quiz.subtitle}`}
      />

      {quiz.mode === "notes" ? (
        <Alert color="gray" variant="light">
          笔记模式固定没有答案页
        </Alert>
      ) : (
        <Switch
          checked={quiz.answerKey}
          onChange={(e) => quiz.setAnswerKey(e.currentTarget.checked)}
          label="在卷子最后附一页答案"
          description={
            quiz.mode === "columns" && !quiz.fields.includes("blank")
              ? "当前没有「默写」列，打开也不会生成答案页"
              : undefined
          }
          styles={{ label: { fontSize: "var(--mantine-font-size-md)" } }}
        />
      )}

      <Divider />

      <SenseOrder quiz={quiz} />

      <Divider />

      <div>
        <LabelRow text={`预览 · 本次出 ${quiz.total} 条`} help={HELP.preview} />
        <div style={{ marginTop: 8 }}>
          <Preview quiz={quiz} />
        </div>
      </div>

      {quiz.msg && (
        <Alert
          color={quiz.msg.ok ? "green" : "red"}
          variant="light"
          icon={
            quiz.msg.ok ? <CheckCircle size={20} /> : <Warning size={20} />
          }
          onClose={() => quiz.setMsg(null)}
          withCloseButton
        >
          <Text size="sm" style={{ wordBreak: "break-all", lineHeight: 1.5 }}>
            {quiz.msg.text}
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
