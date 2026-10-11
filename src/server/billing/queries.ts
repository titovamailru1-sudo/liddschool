import type { PaymentMethod, Prisma } from "@prisma/client";
import { addDays, firstOfMonth, fromDbDate, startOfDay, toDbDate, type LocalDate } from "@/domain/calendar";
import { prisma } from "../db";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Наличные",
  CARD: "Карта",
  TRANSFER: "Перевод",
  SBP: "СБП",
  ONLINE: "Онлайн-касса",
};

export const LEDGER_LABEL = {
  PAYMENT: "Оплата",
  LESSON_CHARGE: "Урок",
  INVOICE_CHARGE: "Абонемент",
  CREDIT_TRANSFER: "Перерасчёт",
  REFUND: "Возврат",
  ADJUSTMENT: "Корректировка",
} as const;

// ───────────────────────── Абонементы на месяц ─────────────────────────

export async function invoicesForMonth(year: number, month: number) {
  const m = toDbDate(firstOfMonth(year, month));
  const [invoices, monthlyClients] = await Promise.all([
    prisma.monthlyInvoice.findMany({
      where: { month: m },
      orderBy: { client: { fullName: "asc" } },
      include: {
        client: { select: { id: true, fullName: true, parents: { select: { telegramChatId: true }, orderBy: { isPrimary: "desc" }, take: 1 } } },
        payments: { where: { cancelledAt: null }, select: { amount: true } },
        messages: { where: { kind: "invoice" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, error: true } },
        adjustments: { select: { amount: true, reason: true } },
      },
    }),
    prisma.client.findMany({
      where: { paymentMode: "MONTHLY", status: "ACTIVE" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const invoiced = new Set(invoices.map((i) => i.clientId));
  return {
    invoices: invoices.map((i) => ({
      id: i.id,
      clientId: i.clientId,
      clientName: i.client.fullName,
      telegramLinked: !!i.client.parents[0]?.telegramChatId,
      lessonsCount: i.lessonsCount,
      hours: Number(i.hours),
      amount: i.amount,
      perLessonAmount: i.perLessonAmount,
      adjustmentsTotal: i.adjustmentsTotal,
      adjustments: i.adjustments,
      debtIncluded: i.debtIncluded,
      creditApplied: i.creditApplied,
      total: i.total,
      paid: i.payments.reduce((s, p) => s + p.amount, 0),
      status: i.status,
      charged: !!i.chargedAt,
      messageText: i.messageText,
      message: i.messages[0] ?? null,
    })),
    withoutInvoice: monthlyClients.filter((c) => !invoiced.has(c.id)),
  };
}

export type MonthInvoices = Awaited<ReturnType<typeof invoicesForMonth>>;

// ───────────────────────── Платежи и долги ─────────────────────────

export interface PaymentFilters {
  from: LocalDate;
  to: LocalDate;
  method?: PaymentMethod;
  clientId?: string;
  receivedById?: string;
}

export async function paymentsJournal(f: PaymentFilters) {
  const where: Prisma.PaymentWhereInput = {
    paidAt: { gte: startOfDay(f.from), lt: startOfDay(addDays(f.to, 1)) },
    ...(f.method ? { method: f.method } : {}),
    ...(f.clientId ? { clientId: f.clientId } : {}),
    ...(f.receivedById ? { receivedById: f.receivedById } : {}),
  };
  const rows = await prisma.payment.findMany({
    where,
    orderBy: { paidAt: "desc" },
    take: 500,
    include: {
      client: { select: { id: true, fullName: true } },
      receivedBy: { select: { name: true } },
      invoice: { select: { month: true } },
      lesson: { select: { startsAt: true } },
    },
  });
  const active = rows.filter((r) => !r.cancelledAt);
  return {
    total: active.reduce((s, r) => s + r.amount, 0),
    count: active.length,
    rows: rows.map((r) => ({
      id: r.id,
      paidAt: r.paidAt.toISOString(),
      clientId: r.client.id,
      clientName: r.client.fullName,
      amount: r.amount,
      method: r.method,
      purpose: r.invoice ? { kind: "invoice" as const, month: fromDbDate(r.invoice.month) } : r.lesson ? { kind: "lesson" as const, at: r.lesson.startsAt.toISOString() } : { kind: "balance" as const },
      receivedBy: r.receivedBy?.name ?? null,
      comment: r.comment,
      cancelled: r.cancelledAt ? (r.cancelReason ?? "отменён") : null,
    })),
  };
}

/** Клиенты с отрицательным балансом и дата последней оплаты. */
export async function debtors() {
  const sums = await prisma.ledgerEntry.groupBy({ by: ["clientId"], _sum: { amount: true } });
  const negative = sums.filter((s) => (s._sum.amount ?? 0) < 0);
  if (!negative.length) return [];
  const clients = await prisma.client.findMany({
    where: { id: { in: negative.map((n) => n.clientId) } },
    select: {
      id: true,
      fullName: true,
      paymentMode: true,
      status: true,
      parents: { orderBy: { isPrimary: "desc" }, take: 1, select: { fullName: true, phone: true } },
      payments: { where: { cancelledAt: null }, orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true } },
    },
  });
  const debtOf = new Map(negative.map((n) => [n.clientId, -(n._sum.amount ?? 0)]));
  return clients
    .map((c) => ({
      id: c.id,
      fullName: c.fullName,
      paymentMode: c.paymentMode,
      status: c.status,
      parent: c.parents[0] ?? null,
      debt: debtOf.get(c.id)!,
      lastPaymentAt: c.payments[0]?.paidAt.toISOString() ?? null,
    }))
    .sort((a, b) => b.debt - a.debt);
}

export async function staffList() {
  return prisma.user.findMany({ where: { role: { in: ["OWNER", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

// ───────────────────────── Финансы ученика ─────────────────────────

export async function clientFinance(clientId: string) {
  const [entries, invoices, payments, messages] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.monthlyInvoice.findMany({
      where: { clientId },
      orderBy: { month: "desc" },
      include: { payments: { where: { cancelledAt: null }, select: { amount: true } }, paymentLinks: { select: { token: true } } },
    }),
    prisma.payment.findMany({
      where: { clientId },
      orderBy: { paidAt: "desc" },
      include: { receivedBy: { select: { name: true } } },
    }),
    prisma.message.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  let running = 0;
  const ledger = entries.map((e) => {
    running += e.amount;
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      type: e.type,
      amount: e.amount,
      balance: running,
      comment: e.comment,
      author: e.createdBy?.name ?? "система",
      reversal: !!e.reversalOfId,
    };
  });
  return {
    balance: running,
    ledger: ledger.reverse(),
    invoices: invoices.map((i) => ({
      id: i.id,
      month: fromDbDate(i.month),
      lessonsCount: i.lessonsCount,
      total: i.total,
      paid: i.payments.reduce((s, p) => s + p.amount, 0),
      status: i.status,
      token: i.paymentLinks[0]?.token ?? null,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      paidAt: p.paidAt.toISOString(),
      amount: p.amount,
      method: p.method,
      comment: p.comment,
      receivedBy: p.receivedBy?.name ?? null,
      cancelled: p.cancelledAt ? (p.cancelReason ?? "отменён") : null,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      at: m.createdAt.toISOString(),
      kind: m.kind,
      status: m.status,
      error: m.error,
      text: m.text,
    })),
  };
}

export type ClientFinance = Awaited<ReturnType<typeof clientFinance>>;
