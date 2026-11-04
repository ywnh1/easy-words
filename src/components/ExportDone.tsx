import { Box, Button, Callout, Dialog, Flex, Text } from "@radix-ui/themes";
import {
  CheckCircle,
  FileDoc,
  FilePdf,
  ShareNetwork,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";
import { isAndroid, openExported, openPath, shareFile } from "../lib/api";
import type { Format, ExportResult } from "../lib/types";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 导出结果弹窗。
 *
 * 成功和失败都用它 —— 之前失败只把错误写在页面底部，
 * 用户点了「生成文档」看不到反应，以为卡死。
 *
 * Android 上文件落在公共下载目录，但绝大多数用户不用文件管理器，
 * 所以主按钮直接是「分享」，系统面板里就有 WPS、微信、QQ。
 */
export function ExportDone({
  result,
  error,
  format,
  onClose,
}: {
  result: ExportResult | null;
  /** 导出失败时的错误信息 */
  error: string | null;
  format: Format;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const open = !!result || !!error;
  const isDocx = format === "docx";
  const Icon = isDocx ? FileDoc : FilePdf;

  const doShare = async () => {
    if (!result) return;
    setSharing(true);
    setActionErr(null);
    try {
      await shareFile(result.uri, format);
    } catch (e) {
      setActionErr(String(e));
    } finally {
      setSharing(false);
    }
  };

  const doOpen = async () => {
    if (!result) return;
    setActionErr(null);
    try {
      if (isAndroid) await openExported(result.uri, format);
      else await openPath(result.path);
    } catch (e) {
      setActionErr(String(e));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Content maxWidth="440px">
        {error ? (
          <>
            <Flex gap="3" align="center" mb="3">
              <Box style={{ color: "var(--red-11)", display: "flex" }}>
                <Warning size={26} weight="fill" />
              </Box>
              <Dialog.Title size="5">没能生成文件</Dialog.Title>
            </Flex>
            <Callout.Root color="red" size="2">
              <Callout.Text style={{ wordBreak: "break-word" }}>{error}</Callout.Text>
            </Callout.Root>
            <Text size="1" color="gray" mt="3" style={{ display: "block" }}>
              如果反复失败，可以先减少题量（比如只选一个单元），或者换 Word 格式试试。
            </Text>
          </>
        ) : (
          <>
            <Flex gap="3" align="center" mb="4">
              <Box style={{ color: "var(--green-11)", display: "flex" }}>
                <CheckCircle size={30} weight="fill" />
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Dialog.Title size="5" mb="1">
                  生成好了
                </Dialog.Title>
                <Text size="2" color="gray">
                  {result?.count ?? 0} 题 · {humanSize(result?.size ?? 0)}
                </Text>
              </Box>
            </Flex>

            <Flex
              gap="2"
              align="center"
              px="3"
              py="2"
              mb="4"
              style={{ borderRadius: "var(--radius-3)", background: "var(--gray-a3)" }}
            >
              <Icon size={18} color="var(--gray-11)" style={{ flexShrink: 0 }} />
              <Text size="2" weight="medium" style={{ wordBreak: "break-all" }}>
                {result?.file_name}
              </Text>
            </Flex>

            <Flex direction="column" gap="2">
              {isAndroid ? (
                <>
                  <Button size="3" onClick={doShare} loading={sharing} style={{ height: 48 }}>
                    <ShareNetwork size={19} />
                    分享 / 用其它应用打开
                  </Button>
                  <Text size="1" color="gray" align="center">
                    弹出系统分享面板，可选微信、WPS、QQ 等
                  </Text>
                  <Button size="3" variant="soft" onClick={doOpen} style={{ height: 44 }}>
                    直接打开
                  </Button>
                </>
              ) : (
                <Button size="3" onClick={doOpen} style={{ height: 48 }}>
                  打开文件
                </Button>
              )}
            </Flex>

            <Box mt="4">
              <Text size="1" color="gray" mb="1" style={{ display: "block" }}>
                保存在
              </Text>
              <Text
                size="1"
                color="gray"
                style={{ wordBreak: "break-all", fontFamily: "var(--code-font-family)" }}
              >
                {result?.display_path}
              </Text>
            </Box>

            {actionErr && (
              <Text size="2" color="red" mt="3" style={{ display: "block" }}>
                {actionErr}
              </Text>
            )}
          </>
        )}

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" size="2">
              {error ? "知道了" : "完成"}
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
