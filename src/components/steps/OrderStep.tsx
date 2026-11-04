import { Box, Card, Flex, Text, TextField } from "@radix-ui/themes";
import { Shuffle } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { OptionTile } from "../../components/PickerField";
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
    quiz.order === "random" && quiz.pickN > 0 ? Math.min(quiz.pickN, quiz.total) : quiz.total;

  return (
    <Flex direction="column" gap="5">
      <Box>
        <LabelRow text="排列顺序" help={HELP.order} required />
        <Flex direction="column" gap="2" mt="2">
          {ORDERS.map((o) => (
            <OptionTile
              key={o.value}
              selected={quiz.order === o.value}
              title={o.label}
              subtitle={o.desc}
              onClick={() => quiz.setOrder(o.value)}
            />
          ))}
        </Flex>
      </Box>

      {quiz.order === "random" && (
        <Card size="2" variant="surface">
          <Flex direction="column" gap="3">
            <Box>
              <LabelRow text="抽取数量" help={HELP.pickN} optional />
              <Box mt="2">
                <TextField.Root
                  type="number"
                  min={0}
                  max={500}
                  value={quiz.pickN}
                  onChange={(e) => quiz.setPickN(Math.max(0, Number(e.currentTarget.value) || 0))}
                  size="3"
                  style={{ minHeight: 44 }}
                />
              </Box>
              <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
                填 0 表示全部都要
              </Text>
            </Box>
            <Text
              size="2"
              color="blue"
              role="button"
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => quiz.setSeed((s) => (s * 1103515245 + 12345) % 2147483647 || 1)}
            >
              <Shuffle size={16} />
              换一批
            </Text>
          </Flex>
        </Card>
      )}

      <Text size="2" color="gray">
        这次会出{" "}
        <Text size="3" weight="bold" color="blue">
          {count}
        </Text>{" "}
        条
        {quiz.order === "random" && quiz.pickN > 0 && quiz.total > quiz.pickN && (
          <Text size="2" color="gray">
            （共命中 {quiz.total} 条）
          </Text>
        )}
      </Text>
    </Flex>
  );
}
