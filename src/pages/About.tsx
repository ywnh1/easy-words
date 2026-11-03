import {
  Anchor,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { APP, issuesUrl, repoUrl } from "../lib/meta";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td w={120} c="dimmed" fz="sm">
        {label}
      </Table.Td>
      <Table.Td fz="sm">{children}</Table.Td>
    </Table.Tr>
  );
}

/** 待填写的链接统一显示成灰色提示，而不是死链。 */
function Pending({ hint }: { hint: string }) {
  return (
    <Text span size="sm" c="dimmed">
      待填写 <Text span size="xs">（{hint}）</Text>
    </Text>
  );
}

export function About({ onBack }: { onBack: () => void }) {
  const repo = repoUrl();
  const issues = issuesUrl();

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2} fz="xl">
          关于
        </Title>
        <Button variant="subtle" size="sm" onClick={onBack}>
          ← 返回首页
        </Button>
      </Group>

      <Paper withBorder radius="md" p="lg">
        <Stack gap={4} mb="md">
          <Title order={3} fz="lg">
            {APP.name}
          </Title>
          <Text size="sm" c="dimmed">
            {APP.tagline}
          </Text>
        </Stack>

        <Table variant="vertical" withRowBorders>
          <Table.Tbody>
            <Row label="版本">
              <Group gap={6}>
                <Text span ff="monospace" size="sm">
                  v{APP.version}
                </Text>
                <Badge size="xs" variant="light">
                  alpha
                </Badge>
              </Group>
            </Row>

            <Row label="开源协议">
              <Anchor href={APP.licenseUrl} target="_blank" rel="noreferrer" size="sm">
                {APP.license}
              </Anchor>
              <Text span size="xs" c="dimmed" ml={6}>
                （可自由使用、修改、分发，需保留版权声明）
              </Text>
            </Row>

            <Row label="源代码">
              {repo ? (
                <Anchor href={repo} target="_blank" rel="noreferrer" size="sm">
                  {repo}
                </Anchor>
              ) : (
                <Pending hint="仓库创建后填写 src/lib/meta.ts 的 repo" />
              )}
            </Row>

            <Row label="问题反馈">
              {issues ? (
                <Anchor href={issues} target="_blank" rel="noreferrer" size="sm">
                  {issues}
                </Anchor>
              ) : (
                <Pending hint="仓库创建后自动由 repo 推导" />
              )}
            </Row>

            <Row label="作者">{APP.author}</Row>

            <Row label="词库来源">
              <Text size="sm">外研社《高中英语》必修第一、二、三册与选择性必修第一册</Text>
            </Row>

            <Row label="例句来源">
              <Text size="sm">牛津高阶英汉双解、柯林斯 COBUILD，以及按高中水平自撰的补充例句</Text>
            </Row>
          </Table.Tbody>
        </Table>

        <Divider my="md" />

        <Text size="xs" c="dimmed" style={{ lineHeight: 1.7 }}>
          本应用仅用于学习与教学。教材词汇表由扫描件转录，「例句」「释义」等内容的著作权
          归原出版方所有，请勿用于商业用途。如果权利人认为有不妥之处，请通过上方的问题反馈
          联系，我会及时处理。
        </Text>
      </Paper>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={onBack}>
          返回首页
        </Button>
      </Group>
    </Container>
  );
}
