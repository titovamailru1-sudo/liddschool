import { execSync } from "node:child_process";
import { E2E_DATABASE_URL, E2E_PASSWORD } from "../playwright.config";

/**
 * Подготовить отдельную базу сквозных тестов (lidd_crm_e2e): применить миграции и залить сид.
 * Сид сам очищает таблицы перед заполнением — только этой базы.
 */
export default function globalSetup() {
  if (!E2E_DATABASE_URL.includes("_e2e")) throw new Error("Сквозные тесты запускаются только на базе *_e2e");
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL, SEED_PASSWORD: E2E_PASSWORD };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
