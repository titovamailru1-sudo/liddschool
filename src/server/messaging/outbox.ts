import { randomBytes } from "node:crypto";
import type { Db } from "../lessons/context";
import { botUsername, type MessageSender, type TelegramUpdate } from "./telegram";

export type MessageKind = "invoice" | "lesson_payment" | "invoice_reminder" | "other";

/** Поставить сообщение в очередь основному родителю ученика. */
export async function queueMessage(
  db: Db,
  m: { clientId: string; kind: MessageKind; text: string; invoiceId?: string; lessonId?: string; createdById?: string },
) {
  const parent = await db.parent.findFirst({
    where: { clientId: m.clientId },
    orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }],
  });
  return db.message.create({
    data: {
      clientId: m.clientId,
      parentId: parent?.id ?? null,
      kind: m.kind,
      text: m.text,
      invoiceId: m.invoiceId,
      lessonId: m.lessonId,
      createdById: m.createdById,
    },
  });
}

/**
 * Отправить сообщения из очереди. Нет бота или родитель не подключил Telegram — сообщение помечается
 * «не отправлено» с причиной: администратор видит его и может отправить вручную или повторить позже.
 */
export async function deliverQueued(db: Db, sender: MessageSender | null, limit = 50, onlyIds?: string[]) {
  const queued = await db.message.findMany({
    where: { status: "QUEUED", ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { parent: { select: { telegramChatId: true } } },
  });
  let sent = 0;
  for (const m of queued) {
    if (!sender) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: "Telegram-бот не настроен" } });
      continue;
    }
    const chatId = m.parent?.telegramChatId;
    if (!chatId) {
      await db.message.update({ where: { id: m.id }, data: { status: "SKIPPED", error: "Родитель не подключил Telegram" } });
      continue;
    }
    try {
      await sender.send(chatId, m.text);
      await db.message.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      sent++;
    } catch (e) {
      await db.message.update({ where: { id: m.id }, data: { status: "FAILED", error: String((e as Error).message).slice(0, 500) } });
    }
  }
  return { processed: queued.length, sent };
}

/** Повторить отправку (после подключения родителя или настройки бота). */
export async function retryMessage(db: Db, sender: MessageSender | null, messageId: string) {
  await db.message.update({ where: { id: messageId }, data: { status: "QUEUED", error: null } });
  await deliverQueued(db, sender, 1, [messageId]);
  return db.message.findUniqueOrThrow({ where: { id: messageId } });
}

// ───────────────────────── Привязка родителя к боту ─────────────────────────

const INVITE_DAYS = 14;

/** Одноразовая ссылка t.me/<бот>?start=<код>. Пока имя бота неизвестно — возвращаем только код. */
export async function createTelegramInvite(db: Db, parentId: string) {
  const code = randomBytes(12).toString("base64url");
  await db.telegramInvite.create({
    data: { parentId, code, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  const username = await botUsername();
  return { code, link: username ? `https://t.me/${username}?start=${code}` : null };
}

/** Обработка входящего сообщения боту: «/start <код>» привязывает чат к родителю. */
export async function handleTelegramUpdate(db: Db, sender: MessageSender, update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const match = /^\/start(?:\s+(\S+))?/.exec(msg.text.trim());
  if (!match) {
    await sender.send(chatId, "Это бот школы Lidd School. Сюда приходят расчёты и ссылки на оплату занятий. Вопросы — администратору школы.");
    return;
  }
  const code = match[1];
  const invite = code
    ? await db.telegramInvite.findUnique({ where: { code }, include: { parent: { include: { client: true } } } })
    : null;
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    await sender.send(chatId, "Ссылка-приглашение недействительна или устарела. Попросите у администратора школы новую.");
    return;
  }
  await db.parent.update({ where: { id: invite.parentId }, data: { telegramChatId: chatId, telegramLinkedAt: new Date() } });
  await db.telegramInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  await sender.send(
    chatId,
    `Здравствуйте! Вы подключены к Lidd School. Сюда будут приходить расчёты и ссылки на оплату занятий: ${invite.parent.client.fullName}.`,
  );
}
