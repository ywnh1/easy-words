import { useState } from "react";
import { Box, Text } from "@mantine/core";
import { Info } from "@phosphor-icons/react";
import { Wizard } from "./components/Wizard";
import { About } from "./pages/About";
import { Home } from "./pages/Home";
import { inTauri } from "./lib/api";

type Page = "home" | "wizard" | "about";

export default function App() {
  const [page, setPage] = useState<Page>("home");

  return (
    <Box mih="100dvh">
      {!inTauri && (
        <Box
          className="safe-top"
          style={{
            background: "var(--mantine-color-yellow-light)",
            color: "var(--mantine-color-yellow-light-color)",
          }}
        >
          <Box
            px="md"
            py={6}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <Text size="xs" lh={1.4}>
              界面预览版：数据是真实词库的一小部分，配置与预览可用，生成文档需要桌面或安卓客户端。
            </Text>
          </Box>
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
