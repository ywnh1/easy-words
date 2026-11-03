import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json";

// Tauri 需要固定端口，并且不要在端口被占用时自动换端口
export default defineConfig(({ mode }) => {
  // mode=preview：打成单文件 IIFE，好让手机浏览器直接双击打开
  const single = mode === "preview";
  return {
    base: single ? "./" : "/",
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    // 版本号只有一处来源：package.json
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 1420,
      strictPort: true,
      host: "127.0.0.1",
      watch: { ignored: ["**/src-tauri/**"] },
    },
    build: {
      target: "es2021",
      outDir: single ? "dist-preview" : "dist",
      // 单文件模式下把 CSS 也并进 JS 之外的一个文件，稍后由脚本内联进 HTML
      cssCodeSplit: false,
      rollupOptions: single
        ? {
            output: {
              format: "iife" as const,
              inlineDynamicImports: true,
              entryFileNames: "app.js",
              assetFileNames: "app.[ext]",
            },
          }
        : {
            // Mantine 一个人就占一半体积，单独成块，升级组件库时主包指纹不变
            output: {
              // 只拆 Mantine：它单块就超过 500KB，拆开后主包升级不受影响
              manualChunks: { mantine: ["@mantine/core", "@mantine/hooks"] },
            },
          },
    },
  };
});
