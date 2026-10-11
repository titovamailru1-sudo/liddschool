import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Тестовая база — отдельная, чтобы интеграционные тесты не трогали данные разработки.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://lidd:lidd@localhost:5432/lidd_crm_test?schema=public";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          env: { DATABASE_URL: TEST_DATABASE_URL },
          globalSetup: ["./src/test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
