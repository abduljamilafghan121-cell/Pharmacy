import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    env: {
      JWT_SECRET: "test-secret",
      LOG_LEVEL: "silent",
    },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});