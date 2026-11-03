import { Badge, Button, Center, Group, Stack, Text, Title } from "@mantine/core";
import { APP } from "../lib/meta";

/** 首页：只有两个入口。 */
export function Home({
  onStart,
  onAbout,
}: {
  onStart: () => void;
  onAbout: () => void;
}) {
  return (
    <Center mih="100dvh" p="xl">
      <Stack align="center" gap="lg" maw={460}>
        <Stack align="center" gap={6}>
          <Title order={1} fz={{ base: 34, sm: 44 }} fw={700}>
            {APP.name}
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            {APP.tagline}
          </Text>
          <Badge variant="light" size="sm" mt={4}>
            外研社高中英语 四册词表
          </Badge>
        </Stack>

        <Stack w="100%" gap="sm" mt="md">
          <Button size="lg" fullWidth onClick={onStart} autoFocus>
            开始出题
          </Button>
          <Button size="lg" fullWidth variant="default" onClick={onAbout}>
            关于
          </Button>
        </Stack>

        <Group gap={4} mt="xl">
          <Text size="xs" c="dimmed">
            v{APP.version} · {APP.license}
          </Text>
        </Group>
      </Stack>
    </Center>
  );
}
