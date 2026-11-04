import {
  Button,
  Group,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Text,
} from "@mantine/core";
import { Shuffle } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { HELP } from "../../lib/wizard-config";
import type { OrderBy } from "../../lib/types";
import type { Quiz } from "../../state/useQuiz";

const ORDERS: { value: OrderBy; label: string; desc: string }[] = [
  { value: "book", label: "书后顺序", desc: "按课本词表原序，方便对照复习" },
  { value: "initial", label: "首字母", desc: "a→z 排列，适合系统过一遍" },
  { value: "random", label: "随机", desc: "打乱顺序，适合自测" },
];

export function OrderStep({ quiz }: { quiz: Quiz }) {
  const count =
    quiz.order === "random" && quiz.pickN > 0
      ? Math.min(quiz.pickN, quiz.total)
      : quiz.total;

  return (
    <Stack gap="lg">
      <div>
        <LabelRow text="排列顺序" help={HELP.order} required />
        <Radio.Group
          mt={8}
          value={quiz.order}
          onChange={(v) => quiz.setOrder(v as OrderBy)}
        >
          <Stack gap={8}>
            {ORDERS.map((o) => (
              <Radio.Card key={o.value} value={o.value} radius="md" p="sm">
                <Group gap="sm" wrap="nowrap" align="center">
                  <Radio.Indicator />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm">
                      {o.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {o.desc}
                    </Text>
                  </div>
                </Group>
              </Radio.Card>
            ))}
          </Stack>
        </Radio.Group>
      </div>

      {quiz.order === "random" && (
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <NumberInput
              label={<LabelRow text="抽取数量" help={HELP.pickN} optional />}
              value={quiz.pickN}
              onChange={(v) => quiz.setPickN(Math.max(0, Number(v) || 0))}
              min={0}
              max={500}
              suffix=" 条"
              description="填 0 表示全部都要"
            />
            <Button
              variant="light"
              leftSection={<Shuffle size={18} />}
              onClick={() =>
                quiz.setSeed((s) => (s * 1103515245 + 12345) % 2147483647 || 1)
              }
            >
              换一批
            </Button>
          </Stack>
        </Paper>
      )}

      <Text size="sm" c="dimmed">
        这次会出{" "}
        <Text span fw={700} c="brand.6">
          {count}
        </Text>{" "}
        条
        {quiz.order === "random" && quiz.pickN > 0 && quiz.total > quiz.pickN && (
          <Text span size="sm" c="dimmed">
            （共命中 {quiz.total} 条，随机抽 {quiz.pickN} 条）
          </Text>
        )}
      </Text>
    </Stack>
  );
}
