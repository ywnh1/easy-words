import { useEffect, useState } from "react";
import { Box, Button, Card, Flex, Grid, Heading, Skeleton, Text } from "@radix-ui/themes";
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

/** 统计块：大数字 + 小标签。首页不空的关键是给出真实数据。 */
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
    <Card size="2" variant="surface">
      <Flex direction="column" align="center" gap="1">
        <Box style={{ color: "var(--accent-9)", display: "flex" }} aria-hidden>
          {icon}
        </Box>
        {value === null ? (
          <Skeleton width="44px" height="26px" />
        ) : (
          <Text
            size="6"
            weight="bold"
            style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}
          >
            {value.toLocaleString()}
          </Text>
        )}
        <Text size="1" color="gray">
          {label}
        </Text>
      </Flex>
    </Card>
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
    <Flex
      direction="column"
      align="center"
      justify="center"
      px="4"
      className="safe-top safe-bottom safe-x"
      style={{ minHeight: "100dvh" }}
    >
      <Flex direction="column" align="center" gap="4" style={{ width: "100%", maxWidth: 400 }}>
        <img
          src="/icon.png"
          alt=""
          width={84}
          height={84}
          style={{
            borderRadius: 20,
            boxShadow: "0 10px 30px -8px rgba(59,130,246,.45)",
            display: "block",
          }}
        />

        <Heading size="8" align="center">
          {APP.name}
        </Heading>

        <Grid columns="3" gap="2" width="100%" mt="2">
          <Stat
            value={ready ? list.length : null}
            label="册教材"
            icon={<BookOpen size={19} weight="duotone" />}
          />
          <Stat value={entries} label="个词条" icon={<StackIcon size={19} weight="duotone" />} />
          <Stat value={examples} label="条例句" icon={<Quotes size={19} weight="duotone" />} />
        </Grid>

        <Flex direction="column" gap="2" width="100%" mt="4">
          <Button size="4" onClick={onStart} disabled={!ready} style={{ height: 52 }}>
            开始出题
            <ArrowRight size={18} weight="bold" />
          </Button>
          <Button size="3" variant="soft" color="gray" onClick={onAbout} style={{ height: 46 }}>
            <Info size={17} />
            关于
          </Button>
        </Flex>

        <Text size="1" color="gray" mt="3">
          v{APP.version} · {APP.license}
        </Text>
      </Flex>
    </Flex>
  );
}
