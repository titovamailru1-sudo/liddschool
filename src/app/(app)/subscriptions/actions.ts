"use server";

import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import { buildInvoiceDraft, deleteDraft, generateDrafts, issueInvoice } from "@/server/billing/invoices";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { deliverQueued, retryMessage } from "@/server/messaging/outbox";
import { messageSender } from "@/server/messaging/telegram";
import { requirePermission } from "@/server/session";

const month = z.object({ year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) });

export async function generateDraftsAction(payload: z.input<typeof month>): Promise<Result> {
  await requirePermission("subscriptions.view");
  return runAction(async () => {
    const m = month.parse(payload);
    const r = await generateDrafts(prisma, m.year, m.month);
    revalidateBilling();
    const skipped = Object.entries(r.reasons)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return { ok: true, message: `Черновиков: ${r.created}` + (skipped ? `. Пропущено — ${skipped}` : "") };
  });
}

/** Пересчитать черновик одного ученика (или сформировать). from — «выставить сейчас» на оставшиеся уроки месяца. */
export async function rebuildDraftAction(clientId: string, payload: z.input<typeof month>, fromToday = false): Promise<Result<{ invoiceId: string }>> {
  await requirePermission("subscriptions.view");
  return runAction(async () => {
    const m = month.parse(payload);
    const today = localDateOf(now());
    const r = await buildInvoiceDraft(prisma, z.string().min(1).parse(clientId), m.year, m.month, fromToday ? { from: today } : {});
    if (!r.ok) throw new DomainError(`Счёт не сформирован: ${r.reason}`);
    revalidateBilling();
    return { ok: true, message: "Черновик счёта готов", data: { invoiceId: r.invoiceId } };
  });
}

export async function deleteDraftAction(invoiceId: string): Promise<Result> {
  await requirePermission("subscriptions.view");
  return runAction(async () => {
    await deleteDraft(prisma, invoiceId);
    revalidateBilling();
    return { ok: true, message: "Черновик удалён" };
  });
}

/** Отправить счёт(а) родителям: после проверки администратором. */
export async function issueInvoicesAction(invoiceIds: string[]): Promise<Result> {
  const user = await requirePermission("subscriptions.view");
  return runAction(async () => {
    const ids = z.array(z.string().min(1)).min(1, "Выберите счета").parse(invoiceIds);
    const today = localDateOf(now());
    const messageIds: string[] = [];
    for (const id of ids) messageIds.push((await issueInvoice(prisma, id, user.id, today)).messageId);
    const d = await deliverQueued(prisma, messageSender(), messageIds.length, messageIds);
    revalidateBilling();
    const notSent = messageIds.length - d.sent;
    return {
      ok: true,
      message:
        `Выставлено счетов: ${ids.length}, отправлено в Telegram: ${d.sent}` +
        (notSent ? `. Не отправлено: ${notSent} — см. статус, текст можно скопировать вручную` : ""),
    };
  });
}

export async function retryMessageAction(messageId: string): Promise<Result> {
  await requirePermission("subscriptions.view");
  return runAction(async () => {
    const m = await retryMessage(prisma, messageSender(), messageId);
    revalidateBilling();
    return m.status === "SENT" ? { ok: true, message: "Отправлено" } : { ok: false, error: m.error ?? "Не отправлено" };
  });
}
