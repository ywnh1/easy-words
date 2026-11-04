import { Group, Text } from "@mantine/core";
import { Help } from "./Help";

/**
 * 字段标签：名称 + 必填/选填 + 问号。
 *
 * 作为 Mantine 各输入组件的 label 属性传入。
 * 用文字而不是彩色徽章标必填：徽章多了会变成一排色块，反而干扰阅读。
 */
export function LabelRow({
  text,
  help,
  required,
  optional,
}: {
  text: string;
  help: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <Group gap={6} wrap="nowrap" component="span" align="center">
      <span>{text}</span>
      {required && (
        <Text span size="xs" fw={500} c="brand.6">
          必填
        </Text>
      )}
      {optional && (
        <Text span size="xs" c="dimmed">
          选填
        </Text>
      )}
      <Help title={text}>{help}</Help>
    </Group>
  );
}
