import { Badge, Box, Button, Center, Group, Stack, Text, Title } from "@mantine/core";
import { ArrowRight, Info } from "@phosphor-icons/react";
import { APP } from "../lib/meta";

/** 首页：视觉重心是一个按钮，其余都是陪衬。 */
export function Home({
  onStart,
  onAbout,
}: {
  onStart: () => void;
  onAbout: () => void;
}) {
  return (
    <Center
      mih="100dvh"
      px="lg"
      className="safe-top safe-bottom safe-x"
      style={{ overflowY: "auto" }}
    >
      <Stack align="center" gap={0} w="100%" maw={400}>
        {/* 应用图标：与桌面/手机图标同一张 */}
        <Box
          component="img"
          src="/icon.png"
          alt=""
          w={96}
          h={96}
          mb="lg"
          style={{
            borderRadius: 24,
            boxShadow: "0 8px 24px -6px rgba(59,130,246,.35)",
          }}
        />

        <Title order={1} ta="center" fz={34} lh={1.15} mb={8}>
          {APP.name}
        </Title>
        <Text c="dimmed" size="md" ta="center" maw={300} lh={1.5}>
          {APP.tagline}
        </Text>

        <Badge variant="light" size="lg" radius="sm" mt="md" tt="none" fw={500}>
          外研社高中英语 · 四册词表
        </Badge>

        <Stack w="100%" gap="sm" mt={40}>
          <Button
            size="xl"
            fullWidth
            onClick={onStart}
            rightSection={<ArrowRight size={20} weight="bold" />}
            styles={{ root: { height: 56, fontSize: 17 } }}
          >
            开始出题
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="default"
            onClick={onAbout}
            leftSection={<Info size={18} />}
            styles={{ root: { height: 48 } }}
          >
            关于
          </Button>
        </Stack>

        <Group gap={6} mt={32}>
          <Text size="xs" c="dimmed">
            v{APP.version}
          </Text>
          <Text size="xs" c="dimmed">
            ·
          </Text>
          <Text size="xs" c="dimmed">
            {APP.license}
          </Text>
        </Group>
      </Stack>
    </Center>
  );
}
