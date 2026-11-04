import { Box, Flex, Text } from "@radix-ui/themes";
import { CardsThree, Note, SelectionPlus, TextAa } from "@phosphor-icons/react";
import { LabelRow } from "../../components/LabelRow";
import { OptionTile } from "../../components/PickerField";
import { MODE_DESC, MODE_LABEL, type Mode } from "../../lib/types";
import { HELP } from "../../lib/wizard-config";
import type { Quiz } from "../../state/useQuiz";

const MODES: { value: Mode; icon: React.ReactNode }[] = [
  { value: "columns", icon: <CardsThree size={18} weight="duotone" /> },
  { value: "sentence", icon: <TextAa size={18} weight="duotone" /> },
  { value: "cloze", icon: <SelectionPlus size={18} weight="duotone" /> },
  { value: "notes", icon: <Note size={18} weight="duotone" /> },
];

export function ModeStep({ quiz }: { quiz: Quiz }) {
  return (
    <Flex direction="column" gap="4">
      <Flex gap="2" align="center">
        <Text size="2" color="gray">
          必选一项
        </Text>
        <LabelRow text="怎么选" help={HELP.modeGuide} />
      </Flex>

      <Flex direction="column" gap="2">
        {MODES.map(({ value, icon }) => {
          const selected = quiz.mode === value;
          return (
            <OptionTile
              key={value}
              selected={selected}
              title={MODE_LABEL[value]}
              onClick={() => quiz.setMode(value)}
              subtitle={MODE_DESC[value]}
              icon={icon}
            />
          );
        })}
      </Flex>

      <Box pt="1">
        <Text size="1" color="gray">
          选好后，下一步会给这一型对应的设置项。
        </Text>
      </Box>
    </Flex>
  );
}
