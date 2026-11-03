import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Progress,
  Stack,
  Stepper,
  Text,
  Title,
} from "@mantine/core";
import { STEPS } from "../lib/wizard-config";
import { useQuiz } from "../state/useQuiz";
import { DetailStep } from "./steps/DetailStep";
import { ExportStep } from "./steps/ExportStep";
import { ModeStep } from "./steps/ModeStep";
import { OrderStep } from "./steps/OrderStep";
import { ScopeStep } from "./steps/ScopeStep";

/** 出题向导：一步一问，每步都能看到自己这一步是否填好。 */
export function Wizard({ onExit }: { onExit: () => void }) {
  const quiz = useQuiz();
  const [active, setActive] = useState(0);

  if (quiz.bootError) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="无法读取词库">
          <Text size="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {quiz.bootError}
          </Text>
          <Button mt="md" variant="default" onClick={onExit}>
            返回首页
          </Button>
        </Alert>
      </Container>
    );
  }

  // 每一步的必填校验：只有 scope 有硬性要求，其余都有合理默认值
  const stepValid = [quiz.bookIds.length > 0, true, true, true, quiz.total > 0];
  const canNext = stepValid[active];
  const isLast = active === STEPS.length - 1;

  const go = (next: number) => {
    if (next < 0 || next > STEPS.length - 1) return;
    setActive(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Container size="md" py="lg" pb={96}>
      <Group justify="space-between" mb="lg" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Button variant="subtle" size="compact-sm" onClick={onExit} px={4}>
            ← 首页
          </Button>
          <Title order={2} fz="lg">
            开始出题
          </Title>
        </Group>
        <Text size="xs" c="dimmed" visibleFrom="xs">
          {active + 1} / {STEPS.length}
        </Text>
      </Group>

      {/* 手机上顶部进度条 + 步名，桌面用完整 Stepper */}
      <Box hiddenFrom="sm" mb="lg">
        <Progress
          value={((active + 1) / STEPS.length) * 100}
          size="xs"
          radius="xl"
          mb={6}
        />
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            {STEPS[active].title}
          </Text>
          <Text size="xs" c="dimmed">
            {STEPS[active].hint}
          </Text>
        </Group>
      </Box>

      <Box visibleFrom="sm" mb="xl">
        <Stepper
          active={active}
          onStepClick={(i) => {
            // 只允许往回跳，以及往回之后往前走到已填过的步骤
            if (i <= active) go(i);
          }}
          size="sm"
        >
          {STEPS.map((s) => (
            <Stepper.Step key={s.id} label={s.title} description={s.hint} />
          ))}
        </Stepper>
      </Box>

      <Paper withBorder radius="md" p="lg" mih={320}>
        <Stack gap="lg">
          <div>
            <Title order={3} fz="md" mb={2}>
              {STEPS[active].title}
            </Title>
            <Text size="xs" c="dimmed">
              {STEPS[active].hint}
            </Text>
          </div>

          {active === 0 && <ScopeStep quiz={quiz} />}
          {active === 1 && <OrderStep quiz={quiz} />}
          {active === 2 && <ModeStep quiz={quiz} />}
          {active === 3 && <DetailStep quiz={quiz} />}
          {active === 4 && <ExportStep quiz={quiz} />}
        </Stack>
      </Paper>

      <Group justify="space-between" mt="lg">
        <Button
          variant="default"
          onClick={() => go(active - 1)}
          disabled={active === 0}
        >
          上一步
        </Button>
        {isLast ? (
          <Button loading={quiz.busy} disabled={quiz.total === 0} onClick={() => quiz.doExport()}>
            生成 PDF
          </Button>
        ) : (
          <Button onClick={() => go(active + 1)} disabled={!canNext}>
            下一步
          </Button>
        )}
      </Group>
    </Container>
  );
}
