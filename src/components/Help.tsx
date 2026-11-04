import { ActionIcon, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Question } from "@phosphor-icons/react";

/**
 * 配置项旁边的小问号，点开是说明弹窗。
 *
 * 焦点锁定、Esc 关闭、点遮罩关闭都由 Mantine 的 Modal 处理。
 * 触控区靠 ActionIcon 的最小尺寸保证（theme 里全局设的 44px）。
 */
export function Help({ title, children }: { title: string; children: React.ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <ActionIcon
        size="sm"
        radius="xl"
        variant="subtle"
        color="gray"
        onClick={open}
        aria-label={`说明：${title}`}
      >
        <Question size={17} weight="bold" />
      </ActionIcon>
      <Modal opened={opened} onClose={close} title={title} size="md">
        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>
          {children}
        </Text>
      </Modal>
    </>
  );
}
