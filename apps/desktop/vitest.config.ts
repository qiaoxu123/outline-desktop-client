import { defineConfig } from "vitest/config";

// 纯逻辑单测：node 环境即可（不测 DOM/Electron，UI 靠 typecheck + CDP）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
