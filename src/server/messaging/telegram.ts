/**
 * Отправка через Telegram Bot API. Токен — TELEGRAM_BOT_TOKEN в .env (создать бота у @BotFather).
 * TELEGRAM_FAKE=1 — заглушка для разработки и тестов: сообщения «отправляются» в лог.
 */
export interface MessageSender {
  readonly kind: "telegram" | "fake";
  send(chatId: string, text: string): Promise<void>;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
}

class TelegramBot implements MessageSender {
  readonly kind = "telegram" as const;
  constructor(private readonly token: string) {}

  private async call<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal,
    });
    const data = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
    return data.result;
  }

  async send(chatId: string, text: string) {
    await this.call("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
  }

  getMe() {
    return this.call<{ username: string }>("getMe");
  }

  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal) {
    return this.call<TelegramUpdate[]>("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["message"] }, signal);
  }
}

class FakeSender implements MessageSender {
  readonly kind = "fake" as const;
  readonly sent: { chatId: string; text: string }[] = [];
  async send(chatId: string, text: string) {
    this.sent.push({ chatId, text });
    console.log(`[telegram:fake] → ${chatId}\n${text}\n`);
  }
}

export function telegramBot(): TelegramBot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? new TelegramBot(token) : null;
}

let fake: FakeSender | null = null;

/** Отправитель по настройкам окружения: настоящий бот, заглушка или null (не настроен). */
export function messageSender(): MessageSender | null {
  if (process.env.TELEGRAM_FAKE === "1") return (fake ??= new FakeSender());
  return telegramBot();
}

let cachedUsername: string | null | undefined;

/** Имя бота для ссылки-приглашения: TELEGRAM_BOT_USERNAME или запрос getMe. */
export async function botUsername(): Promise<string | null> {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
  if (process.env.TELEGRAM_FAKE === "1") return "lidd_school_test_bot";
  if (cachedUsername !== undefined) return cachedUsername;
  const bot = telegramBot();
  try {
    cachedUsername = bot ? (await bot.getMe()).username : null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}
