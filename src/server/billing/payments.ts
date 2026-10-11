import type { PaymentMethod } from "@prisma/client";
import { formatRub } from "@/domain/format";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";
import { clientBalance } from "./clientLessons";
import { refreshInvoiceStatus } from "./invoices";
import { refreshClientCoverage } from "./perLesson";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface AcceptPaymentInput {
  clientId: string;
  amount: number;
  method: PaymentMethod;
  invoiceId?: string | null;
  lessonId?: string | null;
  paidAt?: Date;
  comment?: string | null;
}

/** Принять оплату: платёж + поступление в журнал. Счёт и «под угрозой» по урокам пересчитываются. */
export async function acceptPayment(db: RootDb, actorId: string, input: AcceptPaymentInput, now = new Date()) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("Сумма должна быть больше нуля (целые рубли)");
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new DomainError("Клиент не найден");
  if (input.invoiceId) {
    const inv = await db.monthlyInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv || inv.clientId !== input.clientId) throw new DomainError("Счёт не принадлежит клиенту");
  }

  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        clientId: input.clientId,
        amount: input.amount,
        method: input.method,
        invoiceId: input.invoiceId ?? null,
        lessonId: input.lessonId ?? null,
        paidAt: input.paidAt ?? now,
        comment: input.comment?.trim() || null,
        receivedById: actorId,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        clientId: input.clientId,
        type: "PAYMENT",
        amount: input.amount,
        paymentId: p.id,
        invoiceId: input.invoiceId ?? null,
        lessonId: input.lessonId ?? null,
        comment: input.comment?.trim() || null,
        createdById: actorId,
      },
    });
    await tx.auditLog.create({
      data: { entity: "Payment", entityId: p.id, action: "accept", userId: actorId, diff: { amount: input.amount, method: input.method } },
    });
    return p;
  });

  if (input.invoiceId) await refreshInvoiceStatus(db, input.invoiceId);
  await refreshOpenInvoices(db, input.clientId);
  await refreshClientCoverage(db, input.clientId, now);
  return { paymentId: payment.id, balance: await clientBalance(db, input.clientId) };
}

/** Ошибочный платёж: сторно в журнале, сам платёж остаётся в истории с причиной. */
export async function cancelPayment(db: RootDb, actorId: string, paymentId: string, reason: string) {
  if (!reason.trim()) throw new DomainError("Укажите причину");
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { ledgerEntries: true } });
  if (!p) throw new DomainError("Платёж не найден");
  if (p.cancelledAt) throw new DomainError("Платёж уже отменён");
  const entry = p.ledgerEntries.find((e) => e.type === "PAYMENT" && !e.reversalOfId);
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
    if (entry) {
      await tx.ledgerEntry.create({
        data: {
          clientId: p.clientId,
          type: "PAYMENT",
          amount: -entry.amount,
          paymentId,
          reversalOfId: entry.id,
          comment: `Сторно платежа ${formatRub(p.amount)}: ${reason.trim()}`,
          createdById: actorId,
        },
      });
    }
    await tx.auditLog.create({ data: { entity: "Payment", entityId: paymentId, action: "cancel", userId: actorId, diff: { reason } } });
  });
  if (p.invoiceId) await refreshInvoiceStatus(db, p.invoiceId);
  return { balance: await clientBalance(db, p.clientId) };
}

/** Возврат денег клиенту или ручная корректировка баланса — только с комментарием. */
export async function adjustBalance(
  db: RootDb,
  actorId: string,
  input: { clientId: string; kind: "REFUND" | "ADJUSTMENT"; amount: number; comment: string },
) {
  if (!input.comment.trim()) throw new DomainError("Комментарий обязателен");
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new DomainError("Укажите сумму");
  if (input.kind === "REFUND" && input.amount < 0) throw new DomainError("Сумма возврата указывается положительной");
  const amount = input.kind === "REFUND" ? -input.amount : input.amount;
  const entry = await db.$transaction(async (tx) => {
    const e = await tx.ledgerEntry.create({
      data: { clientId: input.clientId, type: input.kind, amount, comment: input.comment.trim(), createdById: actorId },
    });
    await tx.auditLog.create({
      data: { entity: "LedgerEntry", entityId: e.id, action: input.kind.toLowerCase(), userId: actorId, diff: { amount, comment: input.comment } },
    });
    return e;
  });
  await refreshOpenInvoices(db, input.clientId);
  await refreshClientCoverage(db, input.clientId, new Date());
  return { entryId: entry.id, balance: await clientBalance(db, input.clientId) };
}

/** После любого движения денег — пересчитать статусы списанных, но ещё не оплаченных счетов. */
async function refreshOpenInvoices(db: Db, clientId: string) {
  const open = await db.monthlyInvoice.findMany({
    where: { clientId, chargedAt: { not: null }, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] } },
    select: { id: true },
  });
  for (const i of open) await refreshInvoiceStatus(db, i.id);
}
