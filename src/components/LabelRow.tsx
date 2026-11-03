import { Badge, Group, Text } from "@mantine/core";
import { Help } from "./Help";

/**
 * 字段标签：名称 + 必填/选填标记 + 问号。
 *
 * 作为 Mantine 各输入组件的 label 属性传入，外观和原生标签一致。
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
    <Group gap={6} wrap="nowrap" component="span">
      <span>{text}</span>
      {required && (
        <Badge size="xs" variant="light" color="indigo" tt="none">
          必填
        </Badge>
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
