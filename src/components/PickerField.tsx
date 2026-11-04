import { useState } from "react";
import { Box, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { CaretRight, Check } from "@phosphor-icons/react";
import { Help } from "./Help";

/**
 * 一行「按钮 + 摘要」，点开是选择弹窗。
 *
 * 为什么不用原生 Select / MultiSelect：手机上点开会盖掉大半个屏幕的
 * 系统下拉，一屏只能看到几个选项，竖向滚还容易误触。弹窗里放网格，
 * 一屏能看十几个，触控区也够大。
 *
 * 触发按钮本身就是摘要：用户不点开也能看到当前选了什么。
 */
export function PickerField({
  label,
  help,
  summary,
  empty,
  required,
  optional,
  onClear,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  /** 当前选择的文字摘要 */
  summary: string;
  /** 是否还没选任何东西（用灰色提示样式） */
  empty?: boolean;
  required?: boolean;
  optional?: boolean;
  /** 弹窗里的「清空」 */
  onClear?: () => void;
  /** 弹窗内容，通常是选项网格 */
  children: (close: () => void) => React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Stack gap={6}>
        <Group gap={6} wrap="nowrap" align="center">
          <Text size="sm" fw={500} c="dimmed">
            {label}
          </Text>
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
          {help && <Help title={label}>{help}</Help>}
        </Group>

        <Box
          component="button"
          type="button"
          onClick={() => setOpened(true)}
          aria-label={`${label}：${summary}`}
          style={{
            width: "100%",
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            border: `1px solid ${
              empty
                ? "var(--mantine-color-slate-3)"
                : "var(--mantine-color-brand-4)"
            }`,
            background: empty
              ? "var(--mantine-color-white)"
              : "var(--mantine-color-brand-0)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Text
            size="sm"
            style={{ flex: 1, minWidth: 0 }}
            c={empty ? "dimmed" : "brand.8"}
            fw={empty ? 400 : 600}
            lineClamp={2}
          >
            {summary}
          </Text>
          <CaretRight
            size={18}
            color="var(--mantine-color-slate-5)"
            style={{ flexShrink: 0 }}
          />
        </Box>
      </Stack>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={label}
        size="md"
        closeOnClickOutside
      >
        <Stack gap="md">
          {onClear && (
            <Group justify="flex-end">
              <Button
                size="compact-sm"
                variant="subtle"
                color="gray"
                onClick={() => {
                  onClear();
                  setOpened(false);
                }}
              >
                清空
              </Button>
            </Group>
          )}
          {children(() => setOpened(false))}
        </Stack>
      </Modal>
    </>
  );
}

/** 网格中的一个可选块。选中态用品牌色描边 + 浅底 + 勾。 */
export function OptionTile({
  selected,
  onClick,
  title,
  subtitle,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  disabled?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={{
        position: "relative",
        minHeight: 56,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1.5px solid ${
          selected ? "var(--mantine-color-brand-6)" : "var(--mantine-color-slate-3)"
        }`,
        background: selected
          ? "var(--mantine-color-brand-0)"
          : "var(--mantine-color-white)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
      }}
    >
      {selected && (
        <Box
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            color: "var(--mantine-color-brand-6)",
          }}
          aria-hidden
        >
          <Check size={15} weight="bold" />
        </Box>
      )}
      <Text
        size="sm"
        fw={selected ? 600 : 500}
        c={selected ? "brand.8" : "slate.8"}
        pr={selected ? 16 : 0}
      >
        {title}
      </Text>
      {subtitle && (
        <Text size="xs" c="dimmed">
          {subtitle}
        </Text>
      )}
    </Box>
  );
}
