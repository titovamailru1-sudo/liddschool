import { execSync } from "node:child_process";

/** Перед интеграционными тестами применяем миграции к тестовой базе. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://lidd:lidd@localhost:5432/lidd_crm_test?schema=public";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
