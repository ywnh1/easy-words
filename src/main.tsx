import React from "react";
import ReactDOM from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./index.css";
import App from "./App";
import { THEME } from "./lib/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* appearance="inherit" 跟随系统深浅色；Radix 自带首帧配色，不会闪白 */}
    <Theme {...THEME} appearance="inherit">
      <App />
    </Theme>
  </React.StrictMode>,
);
