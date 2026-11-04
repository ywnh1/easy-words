import { Flex, Text } from "@radix-ui/themes";
import { Help } from "./Help";

/**
 * 字段标签：名称 + 必填/选填 + 问号。
 *
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
    <Flex gap="2" align="center" wrap="nowrap">
      <Text size="2" weight="medium">
        {text}
      </Text>
      {required && (
        <Text size="1" weight="medium" color="blue">
          必填
        </Text>
      )}
      {optional && (
        <Text size="1" color="gray">
          选填
        </Text>
      )}
      <Help title={text}>{help}</Help>
    </Flex>
  );
}
