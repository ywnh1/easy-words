import { Button, Group, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core";
import { LabelRow } from "../../components/LabelRow";
import { HELP } from "../../lib/wizard-config";
import type { OrderBy } from "../../lib/types";
import type { Quiz } from "../../state/useQuiz";

const ORDER_OPTIONS: { value: OrderBy; label: string }[] = [
  { value: "book", label: "书后顺序" },
  { value: "initial", label: "首字母" },
  { value: "random", label: "随机" },
];

export function OrderStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="lg">
      <div>
        <LabelRow text="排列顺序" help={HELP.order} required />
        <SegmentedControl
          fullWidth
          mt={6}
          value={quiz.order}
          onChange={(v) => quiz.setOrder(v as OrderBy)}
          data={ORDER_OPTIONS}
        />
      </div>

      {quiz.order === "random" ? (
        <Stack gap="xs">
          <NumberInput
            label={<LabelRow text="抽取数量" help={HELP.pickN} optional />}
            value={quiz.pickN}
            onChange={(v) => quiz.setPickN(Math.max(0, Number(v) || 0))}
            min={0}
            max={500}
            description="填 0 表示全部都要"
          />
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              onClick={() => quiz.setSeed((s) => (s * 1103515245 + 12345) % 2147483647 || 1)}
            >
              换一批
            </Button>
            <Text size="xs" c="dimmed">
              预览与导出用同一个随机结果
            </Text>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          {quiz.order === "book"
            ? "按教材词表原本的排列出题，方便对照课本复习。"
            : "按 a→z 排列，适合系统过一遍或查漏。"}
        </Text>
      )}

      <Text size="xs" c="dimmed">
        当前条件命中 <b>{quiz.total}</b> 条
        {quiz.order === "random" && quiz.pickN > 0 && quiz.total > quiz.pickN
          ? `，将随机抽 ${quiz.pickN} 条`
          : ""}
      </Text>
    </Stack>
  );
}
