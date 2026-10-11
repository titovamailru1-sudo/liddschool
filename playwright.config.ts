import { defineConfig, devices } from "@playwright/test";

/**
 * Сквозные сценарии. Отдельный сервер (порт 3100) на отдельной базе lidd_crm_e2e,
 * которая перед запуском пересоздаётся и заполняется сидом. Данные разработки не трогаются.
 */
const PORT = 3100;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://lidd:lidd@localhost:5432/lidd_crm_e2e?schema=public";
export const E2E_PASSWORD = "e2e-password";

const env = {
  DATABASE_URL: E2E_DATABASE_URL,
  SEED_PASSWORD: E2E_PASSWORD,
  AUTH_SECRET: "e2e-secret-not-for-production-0000000000",
  AUTH_TRUST_HOST: "true",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Asia/Vladivostok",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env,
  },
});
