import { Group, Paper, Radio, SimpleGrid, Stack, Text } from "@mantine/core";
import { LabelRow } from "../../components/LabelRow";
import { MODE_DESC, MODE_LABEL, type Mode } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MODES: Mode[] = ["columns", "sentence", "cloze", "notes"];

export function ModeStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      <Group gap={6} align="center">
        <Text size="sm" fw={500}>
          这是必选项，四选一
        </Text>
        <LabelRow text="怎么选" help={HELP.modeGuide} />
      </Group>

      <Radio.Group value={quiz.mode} onChange={(v) => quiz.setMode(v as Mode)}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {MODES.map((m) => (
            <Radio.Card key={m} value={m} radius="md" p="md">
              <Stack gap={4}>
                <Group gap={8} wrap="nowrap">
                  <Radio.Indicator />
                  <Text fw={600} size="sm">
                    {MODE_LABEL[m]}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" pl={26} style={{ lineHeight: 1.6 }}>
                  {MODE_DESC[m]}
                </Text>
              </Stack>
            </Radio.Card>
          ))}
        </SimpleGrid>
      </Radio.Group>

      <Paper bg="var(--mantine-color-default-hover)" p="sm" radius="sm">
        <Text size="xs" c="dimmed">
          选好之后，「下一步」会按这一型给出对应的设置项。
        </Text>
      </Paper>
    </Stack>
  );
}
