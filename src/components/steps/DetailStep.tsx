import { Box, Button, Callout, Flex, Grid, Separator, Text, TextField } from "@radix-ui/themes";
import { CaretDown, CaretUp, Info, Plus } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { OptionTile } from "../../components/PickerField";
import { FIELD_LABEL, HINT_LABEL, type Field, type Hint } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const ALL_FIELDS: Field[] = ["word", "phonetic", "meaning", "blank"];
const ALL_HINTS: Hint[] = ["none", "zh", "en", "phonetic", "initial"];

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
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="显示哪些列" help={HELP.columns} required />
        <Text size="1" color="gray" mt="1" mb="3" style={{ display: "block" }}>
          从上到下就是表格里从左到右的顺序
        </Text>

        <Flex direction="column" gap="2">
          {quiz.fields.map((f, i) => (
            <Flex
              key={f}
              align="center"
              gap="2"
              px="3"
              py="2"
              style={{
                borderRadius: "var(--radius-3)",
                border: "1px solid var(--gray-a6)",
                background: "var(--color-panel-solid)",
                minHeight: 52,
              }}
            >
              <Text size="2" style={{ flex: 1 }}>
                {FIELD_LABEL[f]}
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
                disabled={i === quiz.fields.length - 1}
                aria-label="下移"
              >
                <CaretDown size={15} />
              </Button>
              <Button
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => quiz.setFields(quiz.fields.filter((x) => x !== f))}
                aria-label={`去掉${FIELD_LABEL[f]}列`}
              >
                去掉
              </Button>
            </Flex>
          ))}
        </Flex>

        {missing.length > 0 && (
          <Flex gap="2" mt="3" wrap="wrap">
            {missing.map((f) => (
              <Button
                key={f}
                size="2"
                variant="outline"
                onClick={() => quiz.setFields([...quiz.fields, f])}
              >
                <Plus size={15} weight="bold" />
                {FIELD_LABEL[f]}
              </Button>
            ))}
          </Flex>
        )}
      </Box>

      {!quiz.fields.includes("blank") && (
        <Callout.Root color="blue" size="2">
          <Callout.Icon>
            <Info size={17} />
          </Callout.Icon>
          <Callout.Text>
            没有「默写」列，这份卷子只作对照表用，不会生成答案页。
          </Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}

function SentenceDetail({ quiz }: { quiz: Quiz }) {
  const overrideCount = Object.keys(quiz.overrides).length;

  return (
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="提示方式" help={HELP.hint} required />
        <Grid columns="2" gap="2" mt="2">
          {ALL_HINTS.map((h) => (
            <OptionTile
              key={h}
              selected={quiz.hint === h}
              title={HINT_LABEL[h]}
              onClick={() => quiz.setHint(h)}
            />
          ))}
        </Grid>
        <Text size="1" color="gray" mt="2" style={{ display: "block" }}>
          下一步的预览里，可以给单个词单独改
        </Text>
      </Box>

      {overrideCount > 0 && (
        <Flex align="center" justify="between" px="3" py="2"
          style={{ borderRadius: "var(--radius-3)", background: "var(--gray-a3)" }}>
          <Text size="2" color="gray">
            已为 {overrideCount} 个词单独设置
          </Text>
          <Button size="1" variant="ghost" color="gray" onClick={() => quiz.setOverrides({})}>
            全部恢复
          </Button>
        </Flex>
      )}

      <Callout.Root color="gray" size="2">
        <Callout.Icon>
          <Info size={17} />
        </Callout.Icon>
        <Callout.Text>
          每个词取它的第一条例句挖空；没有例句的词会跳过，不占题号。
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}

function ClozeDetail({ quiz }: { quiz: Quiz }) {
  const short = quiz.total < quiz.clozeN + quiz.clozeM;

  return (
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="N · 考察短语数" help={HELP.clozeN} required />
        <Box mt="2">
          <TextField.Root
            type="number"
            min={1}
            max={40}
            value={quiz.clozeN}
            onChange={(e) => quiz.setClozeN(Math.max(1, Number(e.currentTarget.value) || 1))}
            size="3"
            style={{ minHeight: 44 }}
          />
        </Box>
        <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
          也是句子数量
        </Text>
      </Box>

      <Box>
        <LabelRow text="M · 干扰选项数" help={HELP.clozeM} optional />
        <Box mt="2">
          <TextField.Root
            type="number"
            min={0}
            max={40}
            value={quiz.clozeM}
            onChange={(e) => quiz.setClozeM(Math.max(0, Number(e.currentTarget.value) || 0))}
            size="3"
            style={{ minHeight: 44 }}
          />
        </Box>
        <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
          M 越大越难
        </Text>
      </Box>

      <Flex
        direction="column"
        gap="1"
        px="3"
        py="3"
        style={{ borderRadius: "var(--radius-3)", background: "var(--accent-a2)" }}
      >
        <Flex align="baseline" gap="1">
          <Text size="7" weight="bold" style={{ color: "var(--accent-11)" }}>
            {quiz.clozeN + quiz.clozeM}
          </Text>
          <Text size="2" color="gray">
            个选项
          </Text>
        </Flex>
        <Text size="2" color="gray">
          {quiz.clozeN} 个答案 + {quiz.clozeM} 个干扰，下面出 {quiz.clozeN} 个句子
        </Text>
      </Flex>

      {short && (
        <Callout.Root color="amber" size="2">
          <Callout.Icon>
            <Info size={17} />
          </Callout.Icon>
          <Callout.Text>
            当前只命中 {quiz.total} 条，选项会不足。回上一步放宽范围，或调小 N/M。
          </Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}

const EXAMPLE_SOURCES = [
  { value: "oxford", label: "牛津", desc: "词典例句" },
  { value: "collins", label: "柯林斯", desc: "词典例句" },
  { value: "own", label: "自撰", desc: "按高中水平补充" },
];

function NotesDetail({ quiz }: { quiz: Quiz }) {
  return (
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="例句来源" help={HELP.exampleSources} optional />
        <Grid columns="1" gap="2" mt="2">
          {EXAMPLE_SOURCES.map((s) => (
            <OptionTile
              key={s.value}
              selected={quiz.exampleSources.includes(s.value)}
              title={s.label}
              subtitle={s.desc}
              onClick={() =>
                quiz.setExampleSources(
                  quiz.exampleSources.includes(s.value)
                    ? quiz.exampleSources.filter((x) => x !== s.value)
                    : [...quiz.exampleSources, s.value],
                )
              }
            />
          ))}
        </Grid>
        <Text size="1" color="gray" mt="2" style={{ display: "block" }}>
          都不选就只列词条和释义
        </Text>
      </Box>

      <Callout.Root color="blue" size="2">
        <Callout.Icon>
          <Info size={17} />
        </Callout.Icon>
        <Callout.Text>
          笔记模式是整理复习用的：英文、音标、多来源中文、例句全列出来，没有答案页。
        </Callout.Text>
      </Callout.Root>
    </Flex>
  );
}

export function DetailStep({ quiz }: { quiz: Quiz }) {
  return (
    <>
      {quiz.mode === "columns" && <ColumnsDetail quiz={quiz} />}
      {quiz.mode === "sentence" && <SentenceDetail quiz={quiz} />}
      {quiz.mode === "cloze" && <ClozeDetail quiz={quiz} />}
      {quiz.mode === "notes" && <NotesDetail quiz={quiz} />}
      <Separator size="4" style={{ display: "none" }} />
    </>
  );
}
