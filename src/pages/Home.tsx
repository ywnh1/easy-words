import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Center,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  ArrowRight,
  BookOpen,
  Info,
  Quotes,
  Stack as StackIcon,
} from "@phosphor-icons/react";
import { catalog } from "../lib/api";
import { APP } from "../lib/meta";
import type { BookInfo } from "../lib/types";

/** 统计项：大数字 + 小标签。首页不空的关键是给出真实数据。 */
function Stat({
  value,
  label,
  icon,
}: {
  value: number | null;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Paper p="sm" radius="lg" style={{ flex: 1, minWidth: 0 }}>
      <Stack gap={2} align="center">
        <Text c="brand.6" style={{ display: "flex", marginBottom: 2 }} aria-hidden>
          {icon}
        </Text>
        {value === null ? (
          <Skeleton height={26} width={44} radius="sm" />
        ) : (
          <Text fz={22} fw={700} lh={1.15} style={{ fontVariantNumeric: "tabular-nums" }}>
            {value.toLocaleString()}
          </Text>
        )}
        <Text size="xs" c="dimmed" ta="center" lh={1.3}>
          {label}
        </Text>
      </Stack>
    </Paper>
  );
}

export function Home({
  onStart,
  onAbout,
}: {
  onStart: () => void;
  onAbout: () => void;
}) {
  const [books, setBooks] = useState<BookInfo[] | null>(null);

  useEffect(() => {
    catalog()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  const list = books ?? [];
  const ready = books !== null && list.length > 0;
  const entries = ready ? list.reduce((a, b) => a + b.total, 0) : null;
  const examples = ready ? list.reduce((a, b) => a + b.with_examples, 0) : null;

  return (
    <Center
      mih="100dvh"
      px="lg"
      className="safe-top safe-bottom safe-x"
      style={{ overflowY: "auto" }}
    >
      <Stack align="center" gap={0} w="100%" maw={420} py="xl">
        {/* 应用图标：与桌面/手机图标同一张 */}
        <Box
          component="img"
          src="/icon.png"
          alt=""
          w={80}
          h={80}
          mb="md"
          style={{
            borderRadius: 20,
            boxShadow: "0 10px 30px -8px rgba(59,130,246,.45)",
          }}
        />

        <Title order={1} ta="center" fz={32} lh={1.15}>
          {APP.name}
        </Title>

        <SimpleGrid cols={3} spacing="xs" w="100%" mt="xl">
          <Stat
            value={ready ? list.length : null}
            label="册教材"
            icon={<BookOpen size={20} weight="duotone" />}
          />
          <Stat
            value={entries}
            label="个词条"
            icon={<StackIcon size={20} weight="duotone" />}
          />
          <Stat
            value={examples}
            label="条例句"
            icon={<Quotes size={20} weight="duotone" />}
          />
        </SimpleGrid>

        <Stack w="100%" gap="sm" mt="xl">
          <Button
            size="xl"
            fullWidth
            onClick={onStart}
            disabled={!ready}
            rightSection={<ArrowRight size={20} weight="bold" />}
            styles={{ root: { height: 54, fontSize: 17 } }}
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

        <Group gap={6} mt="xl">
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
