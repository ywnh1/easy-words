import { Group, Radio, Stack, Text } from "@mantine/core";
import {
  CardsThree,
  Note,
  SelectionPlus,
  TextAa,
} from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { MODE_DESC, MODE_LABEL, type Mode } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MODES: { value: Mode; icon: React.ReactNode }[] = [
  { value: "columns", icon: <CardsThree size={22} /> },
  { value: "sentence", icon: <TextAa size={22} /> },
  { value: "cloze", icon: <SelectionPlus size={22} /> },
  { value: "notes", icon: <Note size={22} /> },
];

export function ModeStep({ quiz }: { quiz: Quiz }) {
  return (
    <Stack gap="md">
      <Group gap={4} align="center">
        <Text size="sm" c="dimmed">
          必选一项
        </Text>
        <LabelRow text="怎么选" help={HELP.modeGuide} />
      </Group>

      <Radio.Group value={quiz.mode} onChange={(v) => quiz.setMode(v as Mode)}>
        <Stack gap={8}>
          {MODES.map(({ value, icon }) => {
            const selected = quiz.mode === value;
            return (
              <Radio.Card
                key={value}
                value={value}
                radius="md"
                p="md"
                style={{
                  borderColor: selected
                    ? "var(--mantine-color-brand-6)"
                    : undefined,
                  background: selected
                    ? "var(--mantine-color-brand-light)"
                    : undefined,
                }}
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Radio.Indicator mt={2} />
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text
                        c={selected ? "brand.7" : "dimmed"}
                        style={{ display: "flex" }}
                        aria-hidden
                      >
                        {icon}
                      </Text>
                      <Text fw={600} size="md">
                        {MODE_LABEL[value]}
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed" lh={1.5}>
                      {MODE_DESC[value]}
                    </Text>
                  </Stack>
                </Group>
              </Radio.Card>
            );
          })}
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
