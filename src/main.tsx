import React from "react";
import ReactDOM from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.layer.css";
import "./index.css";
import App from "./App";

// 主题只调字体和圆角，其余沿用 Mantine 默认值
const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: 'system-ui, -apple-system, "Noto Sans SC", "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'system-ui, -apple-system, "Noto Sans SC", "Segoe UI", sans-serif',
    fontWeight: "600",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
