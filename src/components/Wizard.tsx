import { useState } from "react";
import { Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { ArrowLeft, ArrowRight, House, Warning } from "@phosphor-icons/react";
import { STEPS } from "../lib/wizard-config";
import { useQuiz } from "../state/useQuiz";
import { ExportDone } from "./ExportDone";
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
      <Box className="safe-top safe-bottom" p="5">
        <Card size="3" variant="surface" style={{ borderColor: "var(--red-a6)" }}>
          <Flex gap="2" align="center" mb="2">
            <Warning size={18} color="var(--red-11)" />
            <Heading size="4">无法读取词库</Heading>
          </Flex>
          <Text size="2" color="gray" style={{ wordBreak: "break-word" }}>
            {quiz.bootError}
          </Text>
          <Button mt="4" variant="soft" onClick={onExit}>
            返回首页
          </Button>
        </Card>
      </Box>
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
    <Flex direction="column" style={{ minHeight: "100dvh" }}>
      {/* 顶栏：后退 + 可点的分段进度 */}
      <Box
        className="chrome safe-top safe-x"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid var(--gray-a5)",
        }}
      >
        <Flex align="center" gap="2" px="3" py="2">
          <Button
            variant="ghost"
            color="gray"
            size="2"
            onClick={() => (active === 0 ? onExit() : go(active - 1))}
            aria-label={active === 0 ? "返回首页" : "上一步"}
            style={{ flexShrink: 0 }}
          >
            {active === 0 ? <House size={20} /> : <ArrowLeft size={20} />}
          </Button>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="2" weight="medium" truncate>
              {step.title}
            </Text>
            <Flex gap="1" mt="1" align="center">
              {STEPS.map((s, i) => {
                const reachable = stepValid.slice(0, i).every(Boolean);
                return (
                  <Box
                    key={s.id}
                    role="button"
                    tabIndex={reachable ? 0 : -1}
                    aria-label={`跳到${s.title}`}
                    aria-current={i === active ? "step" : undefined}
                    onClick={() => reachable && go(i)}
                    style={{
                      flex: 1,
                      height: 16,
                      display: "flex",
                      alignItems: "center",
                      cursor: reachable ? "pointer" : "default",
                    }}
                  >
                    <Box
                      style={{
                        width: "100%",
                        height: 3,
                        borderRadius: 2,
                        background:
                          i <= active ? "var(--accent-9)" : "var(--gray-a5)",
                        transition: "background-color 200ms ease",
                      }}
                    />
                  </Box>
                );
              })}
            </Flex>
          </Box>

          <Text size="1" color="gray" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {active + 1}/{STEPS.length}
          </Text>
        </Flex>
      </Box>

      {/* 内容区：底部留出操作栏 + 安全区 */}
      <Box
        px="3"
        pt="4"
        style={{
          flex: 1,
          paddingBottom: "calc(104px + var(--safe-bottom))",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Box key={active} className="step-enter">
          <Box mb="3">
            <Heading size="6" mb="1">
              {step.title}
            </Heading>
            <Text size="2" color="gray">
              {step.hint}
            </Text>
          </Box>

          <Card size="3" variant="surface">
            {active === 0 && <ScopeStep quiz={quiz} />}
            {active === 1 && <OrderStep quiz={quiz} />}
            {active === 2 && <ModeStep quiz={quiz} />}
            {active === 3 && <DetailStep quiz={quiz} />}
            {active === 4 && <ExportStep quiz={quiz} />}
          </Card>
        </Box>
      </Box>

      <ExportDone
        result={quiz.exported}
        error={quiz.exportError}
        format={quiz.format}
        onClose={quiz.clearExport}
      />

      {/* 底部操作栏：两个按钮等宽，整体居中 */}
      <Box
        className="action-bar"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
          paddingTop: 12,
          background: "var(--color-panel-solid)",
          borderTop: "1px solid var(--gray-a5)",
        }}
      >
        <Flex
          gap="3"
          align="center"
          justify="center"
          style={{ maxWidth: 560, margin: "0 auto" }}
        >
          <Button
            variant="soft"
            color="gray"
            size="3"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            style={{ flex: 1, maxWidth: 200 }}
          >
            <ArrowLeft size={17} />
            上一步
          </Button>

          {isLast ? (
            <Button
              size="3"
              onClick={() => quiz.doExport()}
              loading={quiz.busy}
              disabled={quiz.total === 0}
              style={{ flex: 1, maxWidth: 200 }}
            >
              生成文档
            </Button>
          ) : (
            <Button
              size="3"
              onClick={() => go(active + 1)}
              disabled={!canNext}
              style={{ flex: 1, maxWidth: 200 }}
            >
              下一步
              <ArrowRight size={17} weight="bold" />
            </Button>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}
