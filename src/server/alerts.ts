/**
 * Сообщения об ошибках владельцу в Telegram (тот же бот, что для родителей; чат — ALERT_TELEGRAM_CHAT_ID).
 * Без персональных данных: только источник, путь и текст ошибки. Одинаковые ошибки — не чаще раза в 10 минут.
 */
const REPEAT_MS = 10 * 60_000;
const sentAt = new Map<string, number>();

export function alertsEnabled() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID && process.env.TELEGRAM_FAKE !== "1");
}

/** Текст оповещения: источник, где случилось, первая строка ошибки и место в коде. */
export function alertText(source: string, error: unknown, where?: string) {
  const e = error instanceof Error ? error : null;
  const head = e ? `${e.name}: ${e.message}` : `Error: ${String(error)}`;
  const at = e?.stack?.split("\n").find((l) => l.includes("/src/") || l.includes("\\src\\"))?.trim();
  return [`⚠️ Lidd CRM — ошибка (${source})`, where, head.slice(0, 500), at].filter(Boolean).join("\n");
}

export async function reportError(source: "web" | "worker", error: unknown, where?: string) {
  console.error(new Date().toISOString(), `[${source}]`, where ?? "", error);
  if (!alertsEnabled()) return;
  const text = alertText(source, error, where);
  const key = text.split("\n").slice(0, 3).join("|");
  const now = Date.now();
  if (now - (sentAt.get(key) ?? 0) < REPEAT_MS) return;
  sentAt.set(key, now);
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.ALERT_TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("alerts: не удалось отправить в Telegram", (e as Error).message);
  }
}

/** Отметка «воркер жив» — проверяется в /api/health. */
export const WORKER_HEARTBEAT_KEY = "worker:heartbeat";
