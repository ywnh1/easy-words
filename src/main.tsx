import React from "react";
import ReactDOM from "react-dom/client";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.layer.css";
import "./index.css";
import App from "./App";
import { theme } from "./lib/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {/* 把首帧配色写进 <head>，避免深色系统下先闪一下白底 */}
      <ColorSchemeScript defaultColorScheme="auto" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
