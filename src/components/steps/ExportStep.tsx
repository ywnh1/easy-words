import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  ScrollArea,
  SegmentedControl,
  Text,
  TextField,
} from "@radix-ui/themes";
import { CaretDown, CaretUp, CheckCircle, Info, Warning } from "@phosphor-icons/react";
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
    <Box>
      <LabelRow text="中文释义来源" help={HELP.senseSources} required />
      <Text size="1" color="gray" mt="1" mb="3" style={{ display: "block" }}>
        排在前面的优先，没有就自动用下一个
      </Text>

      <Flex direction="column" gap="2">
        {quiz.senseAll.map((s: SenseSource, i) => {
          const on = quiz.senseOn[s];
          return (
            <Flex
              key={s}
              align="center"
              gap="2"
              px="3"
              py="2"
              style={{
                borderRadius: "var(--radius-3)",
                border: "1px solid var(--gray-a6)",
                background: on ? "var(--color-panel-solid)" : "transparent",
                opacity: on ? 1 : 0.5,
                minHeight: 52,
              }}
            >
              <Box
                role="checkbox"
                aria-checked={on}
                aria-label={`启用${SENSE_LABEL[s]}`}
                tabIndex={0}
                onClick={() => quiz.setSenseOn({ ...quiz.senseOn, [s]: !on })}
                style={{
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: 5,
                  border: `1.5px solid ${on ? "var(--accent-9)" : "var(--gray-a8)"}`,
                  background: on ? "var(--accent-9)" : "transparent",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                {on && <CheckCircle size={13} weight="fill" color="white" />}
              </Box>
              <Text size="2" style={{ flex: 1 }} color={on ? undefined : "gray"}>
                {SENSE_LABEL[s]}
              </Text>
              <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                {i + 1}
              </Text>
              <Button
                variant="soft"
                color="gray"
                size="1"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="上移"
              >
                <CaretUp size={15} />
              </Button>
              <Button
                variant="soft"
                color="gray"
                size="1"
                onClick={() => move(i, i + 1)}
                disabled={i === quiz.senseAll.length - 1}
                aria-label="下移"
              >
                <CaretDown size={15} />
              </Button>
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
}

/** 预览：卡片列表。手机上表格列会被挤成竖条，读不出东西。 */
function Preview({ quiz }: { quiz: Quiz }) {
  if (quiz.preview.length === 0) {
    return (
      <Card size="2" variant="surface">
        <Text size="2" color="gray" align="center" style={{ display: "block", padding: "16px 0" }}>
          {quiz.total === 0 ? "当前筛选没有命中，回上一步放宽条件" : "加载中…"}
        </Text>
      </Card>
    );
  }

  return (
    <Box>
      <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 340 }}>
        <Flex direction="column" gap="2" pr="2">
          {quiz.preview.map((e, i) => {
            const key = e.word.toLowerCase();
            return (
              <Flex
                key={`${key}-${i}`}
                gap="2"
                align="start"
                px="3"
                py="2"
                style={{
                  borderRadius: "var(--radius-2)",
                  border: "1px solid var(--gray-a5)",
                  background: "var(--color-panel-solid)",
                }}
              >
                <Text
                  size="1"
                  color="gray"
                  style={{
                    flexShrink: 0,
                    width: 18,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    paddingTop: 3,
                  }}
                >
                  {i + 1}
                </Text>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Flex gap="2" align="baseline" wrap="wrap">
                    <Text size="2" weight="medium">
                      {e.word}
                    </Text>
                    {e.phonetic && (
                      <Text size="1" color="gray">
                        {e.phonetic}
                      </Text>
                    )}
                  </Flex>
                  <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
                    {e.meaning}
                  </Text>
                </Box>
                {quiz.mode === "sentence" && (
                  <Button
                    variant={quiz.overrides[key] ? "soft" : "ghost"}
                    color={quiz.overrides[key] ? "blue" : "gray"}
                    size="1"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      // 循环切换：跟随全局 → 只挖空 → 中文 → 英文 → 音标 → 首字母
                      const order: (Hint | undefined)[] = [
                        undefined,
                        "none",
                        "zh",
                        "en",
                        "phonetic",
                        "initial",
                      ];
                      const cur = quiz.overrides[key];
                      const idx = order.indexOf(cur);
                      const next = order[(idx + 1) % order.length];
                      const m = { ...quiz.overrides };
                      if (!next) delete m[key];
                      else m[key] = next;
                      quiz.setOverrides(m);
                    }}
                    aria-label={`${e.word} 的提示方式`}
                  >
                    {quiz.overrides[key] ? HINT_LABEL[quiz.overrides[key]] : "全局"}
                  </Button>
                )}
              </Flex>
            );
          })}
        </Flex>
      </ScrollArea>

      {quiz.total > quiz.preview.length && (
        <Text size="1" color="gray" align="center" mt="2" style={{ display: "block" }}>
          仅显示前 {quiz.preview.length} 条，导出会包含全部 {quiz.total} 条
        </Text>
      )}
    </Box>
  );
}

export function ExportStep({ quiz }: { quiz: Quiz }) {
  return (
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="导出格式" help={HELP.format} required />
        <Box mt="2">
          <SegmentedControl.Root
            size="3"
            value={quiz.format}
            onValueChange={(v) => quiz.setFormat(v as Format)}
            style={{ width: "100%" }}
          >
            <SegmentedControl.Item value="pdf" style={{ flex: 1 }}>
              {FORMAT_LABEL.pdf}
            </SegmentedControl.Item>
            <SegmentedControl.Item value="docx" style={{ flex: 1 }}>
              {FORMAT_LABEL.docx}
            </SegmentedControl.Item>
          </SegmentedControl.Root>
        </Box>
        <Text size="1" color="gray" mt="2" style={{ display: "block" }}>
          {quiz.format === "docx"
            ? "Word 可以在 WPS / Office 里改题、加减条目，再打印。"
            : "PDF 版式固定，打印出来最整齐，但不好再改。"}
        </Text>
      </Box>

      <Box>
        <LabelRow text="卷头标题" help={HELP.title} optional />
        <Box mt="2">
          <TextField.Root
            placeholder="留空则用题型名"
            value={quiz.title}
            onChange={(e) => quiz.setTitle(e.currentTarget.value)}
            size="3"
          />
        </Box>
      </Box>

      {quiz.mode === "notes" ? (
        <Callout.Root color="gray" size="2">
          <Callout.Icon>
            <Info size={17} />
          </Callout.Icon>
          <Callout.Text>笔记模式固定没有答案页</Callout.Text>
        </Callout.Root>
      ) : (
        <Flex
          align="center"
          gap="3"
          px="3"
          py="2"
          style={{ borderRadius: "var(--radius-3)", background: "var(--gray-a3)" }}
        >
          <Box style={{ flex: 1 }}>
            <Text size="2" weight="medium" style={{ display: "block" }}>
              在卷子最后附一页答案
            </Text>
            {quiz.mode === "columns" && !quiz.fields.includes("blank") && (
              <Text size="1" color="gray">
                当前没有「默写」列，打开也不会有答案页
              </Text>
            )}
          </Box>
          <Box
            role="switch"
            aria-checked={quiz.answerKey}
            tabIndex={0}
            onClick={() => quiz.setAnswerKey(!quiz.answerKey)}
            style={{
              width: 46,
              height: 26,
              flexShrink: 0,
              borderRadius: 13,
              padding: 3,
              background: quiz.answerKey ? "var(--accent-9)" : "var(--gray-a6)",
              cursor: "pointer",
              transition: "background-color 160ms ease",
            }}
          >
            <Box
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "white",
                transform: quiz.answerKey ? "translateX(20px)" : "translateX(0)",
                transition: "transform 180ms cubic-bezier(.4,0,.2,1)",
              }}
            />
          </Box>
        </Flex>
      )}

      <SenseOrder quiz={quiz} />

      <Box>
        <LabelRow text={`预览 · 本次出 ${quiz.total} 条`} help={HELP.preview} />
        <Box mt="2">
          <Preview quiz={quiz} />
        </Box>
      </Box>

      {quiz.msg && (
        <Callout.Root color={quiz.msg.ok ? "green" : "red"} size="2">
          <Callout.Icon>
            {quiz.msg.ok ? <CheckCircle size={17} /> : <Warning size={17} />}
          </Callout.Icon>
          <Callout.Text style={{ wordBreak: "break-all" }}>{quiz.msg.text}</Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}
