import { useState } from "react";
import { Box, Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { CaretRight, Check } from "@phosphor-icons/react";
import { Help } from "./Help";

/**
 * 「摘要按钮 + 选择弹窗」。
 *
 * 为什么不用原生下拉：手机上点开会盖掉大半个屏幕，一屏只看得见几个选项。
 * 弹窗里放网格，一屏能看十几个，触控区也够大。
 *
 * 触发按钮本身就是摘要：不点开也能看到当前选了什么。
 */
export function PickerField({
  label,
  help,
  summary,
  empty,
  required,
  optional,
  hint,
  onClear,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  summary: string;
  empty?: boolean;
  required?: boolean;
  optional?: boolean;
  /** 按钮下方的一行小字说明 */
  hint?: string;
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Box>
      <Flex gap="2" align="center" wrap="nowrap" mb="2">
        <Text size="2" weight="medium" color="gray">
          {label}
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
        {help && <Help title={label}>{help}</Help>}
      </Flex>

      <Dialog.Root open={opened} onOpenChange={setOpened}>
        <Dialog.Trigger>
          <Flex
            align="center"
            gap="2"
            px="3"
            py="2"
            style={{
              minHeight: 48,
              width: "100%",
              borderRadius: "var(--radius-3)",
              border: `1px solid ${
                empty ? "var(--gray-a6)" : "var(--accent-a6)"
              }`,
              background: empty ? "var(--color-panel)" : "var(--accent-a2)",
              cursor: "pointer",
              textAlign: "left",
            }}
            role="button"
            tabIndex={0}
            aria-label={`${label}：${summary}`}
          >
            <Text
              size="2"
              weight={empty ? "regular" : "medium"}
              color={empty ? "gray" : undefined}
              style={{
                flex: 1,
                minWidth: 0,
                color: empty ? undefined : "var(--accent-11)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {summary}
            </Text>
            <CaretRight size={16} color="var(--gray-8)" style={{ flexShrink: 0 }} />
          </Flex>
        </Dialog.Trigger>

        <Dialog.Content maxWidth="520px">
          <Dialog.Title size="5" mb="1">
            {label}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="4">
            选好后按右上角关闭即可
          </Dialog.Description>

          {children(() => setOpened(false))}

          <Flex justify="between" align="center" mt="4" gap="3">
            {onClear ? (
              <Dialog.Close>
                <Button
                  variant="soft"
                  color="gray"
                  size="2"
                  onClick={() => {
                    onClear();
                  }}
                >
                  清空
                </Button>
              </Dialog.Close>
            ) : (
              <span />
            )}
            <Dialog.Close>
              <Button size="2">完成</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {hint && (
        <Text size="1" color="gray" mt="1" style={{ display: "block" }}>
          {hint}
        </Text>
      )}
    </Box>
  );
}

/** 网格里的可选块。选中态：品牌色描边 + 浅底 + 勾。 */
export function OptionTile({
  selected,
  onClick,
  title,
  subtitle,
  icon,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  /** 可选的左侧图标，用于题型这类需要辨识度的选项 */
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Box
      className="pick-tile"
      data-selected={selected}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      onClick={disabled ? undefined : onClick}
      style={{
        position: "relative",
        minHeight: 54,
        width: "100%",
        padding: "10px 12px",
        borderRadius: "var(--radius-3)",
        border: "1.5px solid var(--gray-a6)",
        background: "var(--color-panel-solid)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
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
            color: "var(--accent-11)",
          }}
          aria-hidden
        >
          <Check size={14} weight="bold" />
        </Box>
      )}
      <Flex align="center" gap="2" pr={selected ? "3" : "0"}>
        {icon && (
          <Box
            style={{
              color: selected ? "var(--accent-11)" : "var(--gray-10)",
              display: "flex",
              flexShrink: 0,
            }}
            aria-hidden
          >
            {icon}
          </Box>
        )}
        <Text size="2" weight={selected ? "medium" : "regular"}>
          {title}
        </Text>
      </Flex>
      {subtitle && (
        <Text size="1" color="gray">
          {subtitle}
        </Text>
      )}
    </Box>
  );
}
