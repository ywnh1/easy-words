import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  CheckCircle,
  DownloadSimple,
  FileDoc,
  FilePdf,
  ShareNetwork,
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
 * 导出成功后的弹窗。
 *
 * 为什么要有这个弹窗：Android 上文件落在公共下载目录，但绝大多数用户
 * 根本不用文件管理器 —— 告诉他们「存在 Download/Easy Words/xxx.pdf」
 * 等于什么都没说。所以这里直接给「分享 / 用其它应用打开」，
 * 系统分享面板里就有 WPS、微信、QQ。
 */
export function ExportDone({
  result,
  format,
  onClose,
}: {
  result: ExportResult | null;
  format: Format;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!result) return null;

  const isDocx = format === "docx";
  const Icon = isDocx ? FileDoc : FilePdf;

  const doShare = async () => {
    setSharing(true);
    setErr(null);
    try {
      await shareFile(result.uri, format);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSharing(false);
    }
  };

  const doOpen = async () => {
    setErr(null);
    try {
      // Android 上文件是 content:// URI，必须走插件里的 ACTION_VIEW；
      // 桌面上是普通路径，用 opener 即可
      if (isAndroid) await openExported(result.uri, format);
      else await openPath(result.path);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="已生成"
      size="md"
      closeOnClickOutside={false}
    >
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Box c="teal.6" style={{ display: "flex", flexShrink: 0, marginTop: 2 }}>
            <CheckCircle size={28} weight="fill" />
          </Box>
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Icon size={20} />
              <Text fw={600} size="md" style={{ wordBreak: "break-all" }}>
                {result.file_name}
              </Text>
            </Group>
            <Group gap={6}>
              <Badge size="sm" variant="light" tt="none">
                {result.count} 题
              </Badge>
              <Text size="sm" c="dimmed">
                {humanSize(result.size)}
              </Text>
            </Group>
          </Stack>
        </Group>

        {/* 位置说明只做兜底：真要找文件的人知道去哪找 */}
        <Box
          p="sm"
          style={{
            background: "var(--mantine-color-slate-0)",
            borderRadius: 10,
            border: "1px solid var(--mantine-color-slate-2)",
          }}
        >
          <Text size="xs" c="dimmed" mb={2}>
            保存在
          </Text>
          <Text size="sm" ff="monospace" style={{ wordBreak: "break-all" }}>
            {result.display_path}
          </Text>
        </Box>

        {isAndroid ? (
          <Stack gap="sm">
            <Button
              size="lg"
              leftSection={<ShareNetwork size={20} />}
              loading={sharing}
              onClick={doShare}
              styles={{ root: { height: 50 } }}
            >
              分享 / 用其它应用打开
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              会弹出系统分享面板，可以选微信、WPS、QQ 或任何能打开
              {isDocx ? " Word " : " PDF "}的应用
            </Text>
            <Button variant="default" fullWidth onClick={doOpen} leftSection={<DownloadSimple size={18} />}>
              直接打开
            </Button>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Button size="lg" onClick={doOpen} leftSection={<DownloadSimple size={20} />}>
              打开文件
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              桌面端文件已保存到上面的路径
            </Text>
          </Stack>
        )}

        {err && (
          <Text size="sm" c="red.7">
            {err}
          </Text>
        )}

        <Button variant="subtle" color="gray" fullWidth onClick={onClose}>
          完成
        </Button>
      </Stack>
    </Modal>
  );
}
