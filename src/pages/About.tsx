import {
  ActionIcon,
  Anchor,
  Box,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ArrowLeft, GithubLogo } from "@phosphor-icons/react";
import { APP, issuesUrl, repoUrl } from "../lib/meta";

/** 一行信息：标签在上，值在下。手机上比两列表格好读。 */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={2}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

export function About({ onBack }: { onBack: () => void }) {
  const repo = repoUrl();
  const issues = issuesUrl();

  return (
    <Box className="safe-top safe-bottom safe-x" mih="100dvh">
      <Box px="md" py="sm">
        <Group gap="xs" wrap="nowrap" mb="md">
          <ActionIcon variant="subtle" color="gray" onClick={onBack} aria-label="返回首页">
            <ArrowLeft size={22} />
          </ActionIcon>
          <Title order={2} fz="lg">
            关于
          </Title>
        </Group>

        <Stack gap="md" maw={560} mx="auto">
          <Paper withBorder radius="lg" p="lg">
            <Stack gap="xs" mb="md">
              <Title order={3} fz="xl">
                {APP.name}
              </Title>
              <Text size="sm" c="dimmed">
                {APP.tagline}
              </Text>
              <Text size="sm" c="dimmed">
                版本 v{APP.version}
              </Text>
            </Stack>

            <Divider mb="md" />

            <Stack gap="md">
              <Item label="开源协议">
                <Anchor href={APP.licenseUrl} target="_blank" rel="noreferrer" size="sm">
                  {APP.license}
                </Anchor>
                <Text size="xs" c="dimmed" mt={2}>
                  可自由使用、修改、分发，需保留版权声明
                </Text>
              </Item>

              <Item label="源代码">
                {repo ? (
                  <Anchor
                    href={repo}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <GithubLogo size={16} />
                    {repo.replace(/^https?:\/\//, "")}
                  </Anchor>
                ) : (
                  <Text size="sm" c="dimmed">
                    待填写
                  </Text>
                )}
              </Item>

              <Item label="问题反馈">
                {issues ? (
                  <Anchor href={issues} target="_blank" rel="noreferrer" size="sm">
                    {issues.replace(/^https?:\/\//, "")}
                  </Anchor>
                ) : (
                  <Text size="sm" c="dimmed">
                    待填写
                  </Text>
                )}
              </Item>

              <Item label="作者">
                <Text size="sm">{APP.author}</Text>
              </Item>

              <Divider />

              <Item label="词库来源">
                <Text size="sm" lh={1.6}>
                  外研社《高中英语》必修第一、二、三册与选择性必修第一册
                </Text>
              </Item>

              <Item label="例句来源">
                <Text size="sm" lh={1.6}>
                  牛津高阶英汉双解、柯林斯 COBUILD，以及按高中水平自撰的补充例句
                </Text>
              </Item>
            </Stack>
          </Paper>

          <Text size="xs" c="dimmed" px="xs" lh={1.7}>
            本应用仅用于学习与教学。教材词汇表由扫描件转录，「例句」「释义」等内容的著作权归原出版方所有，
            请勿用于商业用途。如权利人认为有不妥之处，请通过上方的问题反馈联系。
          </Text>
        </Stack>
      </Box>
    </Box>
  );
}
