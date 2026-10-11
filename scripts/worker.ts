/**
 * Фоновый процесс CRM: раз в минуту — счета, списания, просрочки, поурочная оплата, отправка сообщений;
 * постоянно — приём сообщений Telegram-боту (привязка родителей по ссылке-приглашению).
 * Запуск: npm run worker (читает .env).
 */
import { PrismaClient } from "@prisma/client";
import { runJobs } from "../src/server/jobs";
import { handleTelegramUpdate } from "../src/server/messaging/outbox";
import { messageSender, telegramBot } from "../src/server/messaging/telegram";

const prisma = new PrismaClient();
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
const controller = new AbortController();
let stopping = false;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function jobsLoop() {
  while (!stopping) {
    try {
      const result = await runJobs(prisma, new Date(), messageSender());
      log("jobs", JSON.stringify(result));
    } catch (e) {
      log("jobs: ошибка", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

async function telegramLoop() {
  const bot = telegramBot();
  if (!bot) {
    log(process.env.TELEGRAM_FAKE === "1" ? "telegram: режим заглушки" : "telegram: TELEGRAM_BOT_TOKEN не задан — бот выключен");
    return;
  }
  log("telegram: бот запущен (long polling)");
  let offset = 0;
  while (!stopping) {
    try {
      const updates = await bot.getUpdates(offset, 30, controller.signal);
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleTelegramUpdate(prisma, bot, u).catch((e) => log("telegram: ошибка обработки", e));
      }
    } catch (e) {
      if (stopping) break;
      log("telegram: ошибка getUpdates", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

function stop() {
  stopping = true;
  controller.abort();
  log("остановка…");
  setTimeout(() => prisma.$disconnect().finally(() => process.exit(0)), 500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

log(`worker: интервал ${INTERVAL_MS / 1000} с`);
void Promise.all([jobsLoop(), telegramLoop()]);
