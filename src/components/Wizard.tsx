import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ArrowLeft, ArrowRight, House, Warning } from "@phosphor-icons/react";
import { STEPS } from "../lib/wizard-config";
import { useQuiz } from "../state/useQuiz";
import { DetailStep } from "./steps/DetailStep";
import { ExportStep } from "./steps/ExportStep";
import { ModeStep } from "./steps/ModeStep";
import { OrderStep } from "./steps/OrderStep";
import { ScopeStep } from "./steps/ScopeStep";

/** 出题向导：一步一问，底部固定操作栏。 */
export function Wizard({ onExit }: { onExit: () => void }) {
  const quiz = useQuiz();
  const [active, setActive] = useState(0);

  if (quiz.bootError) {
    return (
      <Container size="xs" py="xl" className="safe-top safe-bottom">
        <Alert color="red" icon={<Warning size={20} />} title="无法读取词库">
          <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {quiz.bootError}
          </Text>
          <Button mt="lg" variant="default" onClick={onExit} fullWidth>
            返回首页
          </Button>
        </Alert>
      </Container>
    );
  }

  // 只有第一步有硬性要求，其余都有合理默认值
  const stepValid = [quiz.bookIds.length > 0, true, true, true, quiz.total > 0];
  const canNext = stepValid[active];
  const isLast = active === STEPS.length - 1;
  const step = STEPS[active];

  const go = (next: number) => {
    if (next < 0 || next > STEPS.length - 1) return;
    setActive(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Box mih="100dvh" style={{ display: "flex", flexDirection: "column" }}>
      {/* 顶栏：后退 + 进度条。手机屏幕放不下 5 个步名，一定会换行断字，
          所以只留当前步名 + 进度。 */}
      <Box
        component="header"
        className="safe-top safe-x"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--mantine-color-body)",
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Group gap="xs" px="md" py="xs" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => (active === 0 ? onExit() : go(active - 1))}
            aria-label={active === 0 ? "返回首页" : "上一步"}
          >
            {active === 0 ? <House size={22} /> : <ArrowLeft size={22} />}
          </ActionIcon>

          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>
              {step.title}
            </Text>
            <Progress
              value={((active + 1) / STEPS.length) * 100}
              size={4}
              radius="xl"
              aria-label={`第 ${active + 1} 步，共 ${STEPS.length} 步`}
            />
          </Stack>

          <Text
            size="xs"
            c="dimmed"
            style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
          >
            {active + 1}/{STEPS.length}
          </Text>
        </Group>
      </Box>

      {/* 内容区：底部留出操作栏 + 安全区，否则最后一项被盖住 */}
      <Box
        component="main"
        px="md"
        pt="md"
        style={{
          flex: 1,
          paddingBottom: "calc(96px + var(--safe-bottom))",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Stack gap="md">
          <div>
            <Title order={2} fz="xl" mb={4}>
              {step.title}
            </Title>
            <Text size="sm" c="dimmed">
              {step.hint}
            </Text>
          </div>

          <Paper withBorder radius="lg" p="md">
            {active === 0 && <ScopeStep quiz={quiz} />}
            {active === 1 && <OrderStep quiz={quiz} />}
            {active === 2 && <ModeStep quiz={quiz} />}
            {active === 3 && <DetailStep quiz={quiz} />}
            {active === 4 && <ExportStep quiz={quiz} />}
          </Paper>
        </Stack>
      </Box>

      {/* 底部固定操作栏 */}
      <Box
        component="footer"
        className="action-bar"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
          paddingTop: 12,
          background: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Group gap="sm" wrap="nowrap" style={{ maxWidth: 560, margin: "0 auto" }}>
          <Button
            variant="default"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            style={{ flexShrink: 0 }}
            leftSection={<ArrowLeft size={18} />}
          >
            上一步
          </Button>
          {isLast ? (
            <Button
              style={{ flex: 1 }}
              loading={quiz.busy}
              disabled={quiz.total === 0}
              onClick={() => quiz.doExport()}
            >
              生成文档
            </Button>
          ) : (
            <Button
              style={{ flex: 1 }}
              onClick={() => go(active + 1)}
              disabled={!canNext}
              rightSection={<ArrowRight size={18} weight="bold" />}
            >
              下一步
            </Button>
          )}
        </Group>
      </Box>
    </Box>
  );
}
