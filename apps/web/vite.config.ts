import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API 代理目标：默认本机 3000，可用 API_PROXY_TARGET 覆盖（多实例并行 / 远程后端）
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    // React Compiler：自动 memo 化组件/hooks（React 19 内置 runtime，无需额外包）
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    // 本地开发全同源：/api 与 /auth 代理到 apps/api，
    // 免 CORS 与 better-auth 跨源 origin 校验，cookie 天然可用
    proxy: {
      "/api": apiTarget,
      "/auth": apiTarget,
    },
  },
});

export default config;
