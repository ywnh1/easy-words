import { useState } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { Info } from "@phosphor-icons/react";
import { Wizard } from "./components/Wizard";
import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { inTauri } from "./lib/api";

type Page = "home" | "wizard" | "about";

export default function App() {
  const [page, setPage] = useState<Page>("home");

  return (
    <Box style={{ minHeight: "100dvh" }}>
      {!inTauri && (
        <Box className="safe-top" style={{ background: "var(--amber-4)" }}>
          <Flex
            gap="2"
            align="start"
            px="3"
            py="2"
            style={{ maxWidth: 560, margin: "0 auto" }}
          >
            <Info size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--amber-11)" }} />
            <Text size="1" style={{ color: "var(--amber-11)", lineHeight: 1.5 }}>
              界面预览版：数据是真实词库的一小部分，配置与预览可用，生成文档需要客户端。
            </Text>
          </Flex>
        </Box>
      )}

      {page === "home" && (
        <Home onStart={() => setPage("wizard")} onAbout={() => setPage("about")} />
      )}
      {page === "about" && <About onBack={() => setPage("home")} />}
      {/* 向导卸载后配置会重置，从首页再进来是一份新的卷子 */}
      {page === "wizard" && <Wizard onExit={() => setPage("home")} />}
    </Box>
  );
}
