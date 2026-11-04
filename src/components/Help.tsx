import { Button, Dialog, Flex, IconButton, Text } from "@radix-ui/themes";
import { Question } from "@phosphor-icons/react";

/**
 * 配置项旁边的小问号，点开是说明弹窗。
 *
 * 用 Radix Themes 的 Dialog：焦点锁定、Esc 关闭、点遮罩关闭、
 * 移动端自适应宽度都由它处理，不用自己盯边界情况。
 */
export function Help({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <IconButton
          size="1"
          variant="soft"
          color="gray"
          radius="full"
          aria-label={`说明：${title}`}
          style={{ flexShrink: 0 }}
        >
          <Question size={13} weight="bold" />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="440px">
        <Dialog.Title size="5" mb="3">
          {title}
        </Dialog.Title>
        <Text size="3" color="gray" style={{ lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
          {children}
        </Text>
        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" size="2">
              知道了
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
