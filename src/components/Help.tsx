import { ActionIcon, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

/**
 * 配置项旁边的小问号，点开是说明弹窗。
 *
 * 焦点锁定、Esc 关闭、点遮罩关闭都由 Mantine 的 Modal 处理。
 */
export function Help({ title, children }: { title: string; children: React.ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <ActionIcon
        size="xs"
        radius="xl"
        variant="default"
        onClick={open}
        aria-label={`说明：${title}`}
        className="!font-serif !text-[11px]"
      >
        ?
      </ActionIcon>
      <Modal opened={opened} onClose={close} title={title} size="md" centered>
        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>
          {children}
        </Text>
      </Modal>
    </>
  );
}
