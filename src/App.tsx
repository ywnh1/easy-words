import { useState } from "react";
import { Alert, Box, Text } from "@mantine/core";
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
        <Alert
          color="yellow"
          variant="light"
          radius={0}
          py={6}
          px="md"
          styles={{ body: { padding: 0 }, label: { padding: 0 } }}
        >
          <Text size="xs" ta="center" c="yellow.9">
            界面预览版：数据是真实词库的一小部分，配置与预览可用，生成 PDF 需要桌面或安卓客户端。
          </Text>
        </Alert>
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
