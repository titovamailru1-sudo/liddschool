import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  finalLesson,
  invoicedLessonOutcome,
  isBillableExtra,
  type LessonNode,
} from "@/domain/billing";
import {
  addDays,
  firstOfMonth,
  lastOfMonth,
  localDateOf,
  parseLocalDate,
  startOfDay,
  toDbDate,
  type LocalDate,
} from "@/domain/calendar";
import { calcMonthlyInvoice, renderInvoiceMessage } from "@/domain/monthlyInvoice";
import { greetingName, studentNameGenitive } from "@/domain/names";
import { lessonHours, lessonPrice, tariffOn, type TariffRow } from "@/domain/pricing";
import { DomainError } from "../errors";
import { loadTariffs, type Db } from "../lessons/context";
import { queueMessage } from "../messaging/outbox";
import { clientBalance, clientLessons, moveAncestors, type ClientLesson } from "./clientLessons";
import { appUrl, loadSettings, type SchoolSettings } from "./settings";

type RootDb = Extract<Db, { $transaction: unknown }>;

const ISSUED: Prisma.EnumInvoiceStatusFilter = { notIn: ["DRAFT", "CANCELLED"] };

function monthRange(year: number, month: number, from?: LocalDate) {
  const first = firstOfMonth(year, month);
  const start = from && from > first ? from : first;
  return { gte: startOfDay(start), lt: startOfDay(addDays(lastOfMonth(year, month), 1)) };
}

function rates(tariffs: TariffRow[], l: Pick<ClientLesson, "isGroup" | "program" | "startsAt">) {
  const on = localDateOf(l.startsAt);
  const kind = l.isGroup ? "GROUP" : "INDIVIDUAL";
  return {
    monthlyRate: tariffOn(tariffs, { kind, program: l.program, paymentMode: "MONTHLY" }, on).pricePerHour,
    perLessonRate: tariffOn(tariffs, { kind, program: l.program, paymentMode: "PER_LESSON" }, on).pricePerHour,
  };
}

const toNode = (l: ClientLesson): LessonNode => ({
  id: l.id,
  startsAt: l.startsAt,
  status: l.status,
  cancelledBy: l.cancelledBy,
  movedToId: l.movedToId,
  attendance: l.attendance,
});

/**
 * Перенос разницы из уже выставленных счетов (до 3 месяцев назад):
 * вычет за оплаченные уроки, отменённые школой / уважительный пропуск (после всех переносов),
 * доплата за уроки, добавленные после выставления счёта. Каждый урок корректируется один раз.
 */
async function pendingAdjustments(
  db: Db,
  clientId: string,
  beforeMonth: LocalDate,
  tariffs: TariffRow[],
  settings: SchoolSettings,
  currentInvoiceId: string | null,
) {
  const since = toDbDate(addDays(beforeMonth, -100));
  const invoices = await db.monthlyInvoice.findMany({
    where: { clientId, status: ISSUED, month: { gte: since, lt: toDbDate(beforeMonth) } },
    include: { items: { select: { lessonId: true, amount: true } } },
  });
  if (!invoices.length) return [];

  const adjusted = new Set(
    (
      await db.invoiceAdjustment.findMany({
        where: { clientId, ...(currentInvoiceId ? { invoiceId: { not: currentInvoiceId } } : {}) },
        select: { lessonId: true },
      })
    ).map((a) => a.lessonId),
  );
  const invoicedIds = new Set(
    (
      await db.invoiceItem.findMany({ where: { invoice: { clientId } }, select: { lessonId: true } })
    ).map((i) => i.lessonId),
  );

  // Все уроки ученика за эти месяцы и на месяц вперёд (куда могли перенести).
  const months = invoices.map((i) => fromMonth(i.month));
  const first = months.sort()[0];
  const lessons = await clientLessons(db, clientId, {
    gte: startOfDay(first),
    lt: startOfDay(addDays(beforeMonth, 62)),
  });
  const byId = new Map(lessons.map((l) => [l.id, toNode(l)]));
  // Уроки, на которые перенесли, могли выйти за окно — догружаем цепочки.
  const missing = lessons.filter((l) => l.movedToId && !byId.has(l.movedToId)).map((l) => l.movedToId!);
  if (missing.length) {
    const extra = await db.lesson.findMany({
      where: { id: { in: missing } },
      select: { id: true, startsAt: true, status: true, cancelledBy: true, movedToId: true, attendances: { where: { clientId }, select: { status: true } } },
    });
    for (const e of extra) byId.set(e.id, { ...e, attendance: e.attendances[0]?.status ?? null });
  }

  const result: { lessonId: string; amount: number; reason: string }[] = [];

  // Вычеты за оплаченные уроки.
  for (const inv of invoices) {
    for (const item of inv.items) {
      if (adjusted.has(item.lessonId)) continue;
      const outcome = invoicedLessonOutcome(finalLesson(item.lessonId, byId), settings);
      if (outcome.kind === "credit") result.push({ lessonId: item.lessonId, amount: -item.amount, reason: outcome.reason });
    }
  }

  // Доплаты за уроки, добавленные после выставления счёта своего месяца.
  const ancestors = await moveAncestors(db, lessons.map((l) => l.id));
  const charged = new Set(
    (
      await db.ledgerEntry.findMany({
        where: { clientId, type: "LESSON_CHARGE", lessonId: { in: lessons.map((l) => l.id) } },
        select: { lessonId: true },
      })
    ).map((e) => e.lessonId),
  );
  for (const inv of invoices) {
    const m = fromMonth(inv.month);
    const { year, month } = parseLocalDate(m);
    const range = monthRange(year, month);
    for (const l of lessons) {
      if (l.startsAt < range.gte || l.startsAt >= range.lt) continue;
      if (l.isTrial || invoicedIds.has(l.id) || adjusted.has(l.id) || charged.has(l.id)) continue;
      if (l.createdAt <= inv.createdAt) continue; // не входил в счёт сознательно (например, до начала обучения)
      if (ancestors.get(l.id)!.some((a) => invoicedIds.has(a))) continue; // перенос оплаченного урока
      if (!isBillableExtra(toNode(l))) continue;
      const amount = lessonPrice(lessonHours(l.durationMin), rates(tariffs, l).monthlyRate);
      result.push({ lessonId: l.id, amount, reason: `доплата за урок ${formatShort(l.startsAt)}` });
    }
  }
  return result;
}

function fromMonth(d: Date): LocalDate {
  return d.toISOString().slice(0, 10);
}

function formatShort(d: Date) {
  const s = localDateOf(d);
  return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
}

export type DraftResult = { ok: true; invoiceId: string; total: number } | { ok: false; reason: string };

/**
 * Сформировать (или пересчитать) черновик счёта абонемента ученика на месяц.
 * Уроки берутся из расписания месяца (с `from` — только оставшиеся), перенос разницы — из прошлых счетов.
 * Выставленный счёт не меняется: изменения попадут в перенос разницы следующего месяца.
 */
export async function buildInvoiceDraft(
  db: RootDb,
  clientId: string,
  year: number,
  month: number,
  opts: { from?: LocalDate } = {},
): Promise<DraftResult> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { parents: { orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] } },
  });
  if (!client) throw new DomainError("Ученик не найден");
  if (client.paymentMode !== "MONTHLY") return { ok: false, reason: "ученик платит поурочно" };
  if (client.status === "ARCHIVED") return { ok: false, reason: "ученик в архиве" };

  const monthStart = firstOfMonth(year, month);
  const existing = await db.monthlyInvoice.findUnique({ where: { clientId_month: { clientId, month: toDbDate(monthStart) } } });
  if (existing && existing.status !== "DRAFT") return { ok: false, reason: "счёт уже выставлен" };

  const [tariffs, settings] = await Promise.all([loadTariffs(db), loadSettings(db)]);

  // Уроки месяца, кроме отменённых/перенесённых и перенесённых сюда из уже оплаченных.
  let lessons = await clientLessons(db, clientId, monthRange(year, month, opts.from), { status: { in: ["PLANNED", "DONE"] } });
  lessons = lessons.filter((l) => !l.isTrial && l.attendance !== "ABSENT_EXCUSED");
  const ancestors = await moveAncestors(db, lessons.map((l) => l.id));
  const allAncestors = [...ancestors.values()].flat();
  const paidOrigins = new Set(
    (
      await db.invoiceItem.findMany({
        where: { lessonId: { in: allAncestors }, invoice: { clientId, status: ISSUED } },
        select: { lessonId: true },
      })
    ).map((i) => i.lessonId),
  );
  lessons = lessons.filter((l) => !ancestors.get(l.id)!.some((a) => paidOrigins.has(a)));

  const adjustments = await pendingAdjustments(db, clientId, monthStart, tariffs, settings, existing?.id ?? null);
  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  if (!lessons.length && adjustmentsTotal === 0) return { ok: false, reason: "нет уроков в этом месяце" };

  const invoiceLessons = lessons.map((l) => ({ startsAt: l.startsAt, durationMin: l.durationMin, ...rates(tariffs, l) }));
  const balance = await clientBalance(db, clientId);
  const calc = calcMonthlyInvoice({
    year,
    month,
    lessons: invoiceLessons,
    monthlyRate: invoiceLessons[0]?.monthlyRate ?? 0,
    perLessonRate: invoiceLessons[0]?.perLessonRate ?? 0,
    balance,
    adjustments: adjustmentsTotal,
  });

  return db.$transaction(async (tx) => {
    const data = {
      lessonsCount: calc.lessonsCount,
      hours: calc.hours,
      pricePerHour: invoiceLessons[0]?.monthlyRate ?? 0,
      amount: calc.amount,
      perLessonAmount: calc.perLessonAmount,
      debtIncluded: calc.debtIncluded,
      creditApplied: calc.creditApplied,
      adjustmentsTotal: calc.adjustmentsTotal,
      total: calc.total,
      dueDate: toDbDate(calc.dueDate),
    };
    const invoice = existing
      ? await tx.monthlyInvoice.update({ where: { id: existing.id }, data })
      : await tx.monthlyInvoice.create({ data: { ...data, clientId, month: toDbDate(monthStart) } });
    await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    await tx.invoiceAdjustment.deleteMany({ where: { invoiceId: invoice.id } });
    await tx.invoiceItem.createMany({
      data: lessons.map((l, i) => ({ invoiceId: invoice.id, lessonId: l.id, hours: calc.lines[i].hours, amount: calc.lines[i].amount })),
    });
    await tx.invoiceAdjustment.createMany({
      data: adjustments.map((a) => ({ invoiceId: invoice.id, clientId, lessonId: a.lessonId, amount: a.amount, reason: a.reason })),
    });

    // Ссылка на оплату и текст сообщения.
    const link = await tx.paymentLink.upsert({
      where: { invoiceId: invoice.id },
      create: {
        invoiceId: invoice.id,
        clientId,
        token: randomBytes(12).toString("base64url"),
        amount: calc.total,
        purpose: `Абонемент ${client.fullName} за ${String(month).padStart(2, "0")}.${year}`,
      },
      update: { amount: calc.total },
    });
    const parent = client.parents[0];
    const messageText = renderInvoiceMessage({
      parentName: parent ? greetingName(parent.fullName) : "",
      studentNameGen: studentNameGenitive(client.fullName, client.gender, client.fullNameGen),
      subjects: [...new Set(lessons.map((l) => l.subject))],
      year,
      month,
      lessons: invoiceLessons,
      monthlyRate: invoiceLessons[0]?.monthlyRate ?? 0,
      perLessonRate: invoiceLessons[0]?.perLessonRate ?? 0,
      calc,
      payUrl: `${appUrl()}/pay/${link.token}`,
      adjustmentNotes: adjustments,
    }).replace("Здравствуйте, ! ", "Здравствуйте! ");
    await tx.monthlyInvoice.update({ where: { id: invoice.id }, data: { messageText } });
    return { ok: true as const, invoiceId: invoice.id, total: calc.total };
  });
}

/** Черновики для всех учеников на абонементе (25-го или по кнопке). */
export async function generateDrafts(db: RootDb, year: number, month: number) {
  const clients = await db.client.findMany({
    where: { paymentMode: "MONTHLY", status: "ACTIVE" },
    select: { id: true },
  });
  const summary = { created: 0, skipped: 0, reasons: {} as Record<string, number> };
  for (const c of clients) {
    const r = await buildInvoiceDraft(db, c.id, year, month);
    if (r.ok) summary.created++;
    else {
      summary.skipped++;
      summary.reasons[r.reason] = (summary.reasons[r.reason] ?? 0) + 1;
    }
  }
  return summary;
}

/** Удалить черновик (например, ученик ушёл). Выставленные счета не удаляются. */
export async function deleteDraft(db: RootDb, invoiceId: string) {
  const inv = await db.monthlyInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new DomainError("Счёт не найден");
  if (inv.status !== "DRAFT") throw new DomainError("Выставленный счёт удалить нельзя");
  await db.$transaction([
    db.paymentLink.deleteMany({ where: { invoiceId } }),
    db.monthlyInvoice.delete({ where: { id: invoiceId } }),
  ]);
}

// ───────────────────────── Выставление, списание, статус ─────────────────────────

/** Отправить счёт родителю (после проверки администратором). Если месяц уже начался — сразу списать. */
export async function issueInvoice(db: RootDb, invoiceId: string, actorId: string, today: LocalDate) {
  const inv = await db.monthlyInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new DomainError("Счёт не найден");
  if (inv.status !== "DRAFT") throw new DomainError("Счёт уже выставлен");
  if (!inv.messageText) throw new DomainError("Нет текста сообщения — пересчитайте счёт");
  const message = await db.$transaction(async (tx) => {
    await tx.monthlyInvoice.update({ where: { id: invoiceId }, data: { status: "SENT", sentAt: new Date() } });
    await tx.auditLog.create({ data: { entity: "MonthlyInvoice", entityId: invoiceId, action: "issue", userId: actorId } });
    return queueMessage(tx, { clientId: inv.clientId, kind: "invoice", text: inv.messageText!, invoiceId, createdById: actorId });
  });
  await chargeInvoice(db, invoiceId, today);
  await refreshInvoiceStatus(db, invoiceId);
  return { messageId: message.id };
}

/**
 * Списать выставленный счёт с баланса — в срок оплаты (1-го числа) или сразу, если выставлен позже.
 * Списывается стоимость уроков и перенос разницы; долг и переплата уже учтены в балансе.
 */
export async function chargeInvoice(db: RootDb, invoiceId: string, today: LocalDate) {
  return db.$transaction(async (tx) => {
    const inv = await tx.monthlyInvoice.findUnique({ where: { id: invoiceId }, include: { client: { select: { fullName: true } } } });
    if (!inv || inv.chargedAt || inv.status === "DRAFT" || inv.status === "CANCELLED") return false;
    if (today < fromMonth(inv.month)) return false;
    const charge = inv.amount + inv.adjustmentsTotal;
    const { year, month } = parseLocalDate(fromMonth(inv.month));
    if (charge !== 0) {
      await tx.ledgerEntry.create({
        data: {
          clientId: inv.clientId,
          type: charge > 0 ? "INVOICE_CHARGE" : "CREDIT_TRANSFER",
          amount: -charge,
          invoiceId,
          comment: `Абонемент за ${String(month).padStart(2, "0")}.${year}` + (inv.adjustmentsTotal ? `, перерасчёт ${inv.adjustmentsTotal}` : ""),
        },
      });
    }
    await tx.monthlyInvoice.update({ where: { id: invoiceId }, data: { chargedAt: new Date() } });
    return true;
  });
}

/**
 * Статус оплаты: платежи по счёту ≥ итога — оплачен; часть — частично.
 * После списания счёт считается оплаченным и при неотрицательном балансе (оплатили заранее «на баланс»).
 */
export async function refreshInvoiceStatus(db: Db, invoiceId: string) {
  const inv = await db.monthlyInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.status === "DRAFT" || inv.status === "CANCELLED") return inv;
  const paid = (
    await db.payment.aggregate({ where: { invoiceId, cancelledAt: null }, _sum: { amount: true } })
  )._sum.amount ?? 0;
  let status: typeof inv.status = inv.status === "VIEWED" ? "VIEWED" : "SENT";
  if (paid >= inv.total || inv.total === 0) status = "PAID";
  else if (inv.chargedAt && (await clientBalance(db, inv.clientId)) >= 0) status = "PAID";
  else if (paid > 0) status = "PARTIALLY_PAID";
  return db.monthlyInvoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === "PAID" ? (inv.paidAt ?? new Date()) : null },
  });
}

/** Открытый счёт ученика для привязки платежа: самый ранний неоплаченный выставленный. */
export async function openInvoiceFor(db: Db, clientId: string) {
  return db.monthlyInvoice.findFirst({
    where: { clientId, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] } },
    orderBy: { month: "asc" },
  });
}
