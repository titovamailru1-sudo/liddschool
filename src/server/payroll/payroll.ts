import type { Prisma } from "@prisma/client";
import { addDays, firstOfMonth, fromDbDate, lastOfMonth, parseLocalDate, startOfDay, toDbDate, type LocalDate } from "@/domain/calendar";
import { lessonDisplayStatus } from "@/domain/lessonSettlement";
import { lessonAccrual, monthPayroll, payrollTotals, tierProgress, type Accrual } from "@/domain/payroll";
import { DomainError } from "../errors";
import { loadRatePlan, type Db } from "../lessons/context";

type RootDb = Extract<Db, { $transaction: unknown }>;

/** 1-е число месяца, в который входит дата. */
function monthStartOf(d: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(d);
  return firstOfMonth(year, month);
}

function monthRange(year: number, month: number) {
  return { gte: startOfDay(firstOfMonth(year, month)), lt: startOfDay(addDays(lastOfMonth(year, month), 1)) };
}

/** Начисления по проведённым урокам месяца — то, что педагог уже заработал. */
async function actualAccruals(db: Db, teacherId: string, year: number, month: number) {
  const rows = await db.teacherAccrual.findMany({
    where: { teacherId, lesson: { startsAt: monthRange(year, month) } },
    include: {
      lesson: {
        select: {
          id: true,
          startsAt: true,
          durationMin: true,
          subject: true,
          status: true,
          cancelledBy: true,
          groupId: true,
          client: { select: { fullName: true } },
          group: { select: { name: true } },
          attendances: { select: { status: true } },
        },
      },
    },
    orderBy: { lesson: { startsAt: "asc" } },
  });
  return rows.map((r) => ({
    accrual: { hours: Number(r.hours), hourlyAmount: r.hourlyAmount, extraAmount: r.extraAmount, amount: r.amount, basis: r.basis } as Accrual,
    lesson: {
      id: r.lesson.id,
      startsAt: r.lesson.startsAt.toISOString(),
      durationMin: r.lesson.durationMin,
      subject: r.lesson.subject,
      title: r.lesson.client?.fullName ?? `Группа ${r.lesson.group?.name ?? ""}`,
      status: lessonDisplayStatus(r.lesson.status, r.lesson.cancelledBy, !!r.lesson.groupId, r.lesson.attendances.map((a) => a.status)),
    },
  }));
}

/** Оценка по запланированным урокам месяца: как если бы все пришли. */
async function plannedEstimates(db: Db, teacherId: string, year: number, month: number, plan: Awaited<ReturnType<typeof loadRatePlan>>) {
  const lessons = await db.lesson.findMany({
    where: { teacherId, status: "PLANNED", startsAt: monthRange(year, month) },
    select: { durationMin: true, isTrial: true, groupId: true, startsAt: true },
  });
  const groupIds = [...new Set(lessons.map((l) => l.groupId).filter(Boolean))] as string[];
  const members = groupIds.length
    ? await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { groupId: true, joinedAt: true, leftAt: true } })
    : [];
  return lessons.map((l) => {
    const count = l.groupId
      ? members.filter((m) => m.groupId === l.groupId && m.joinedAt <= l.startsAt && (!m.leftAt || m.leftAt > l.startsAt)).length
      : 1;
    return lessonAccrual(
      { durationMin: l.durationMin, status: "DONE", isTrial: l.isTrial, isGroup: !!l.groupId, attendance: Array(Math.max(count, 1)).fill("PRESENT") },
      plan,
    );
  });
}

async function payrollRow(db: Db, teacherId: string, year: number, month: number) {
  return db.payroll.findUnique({
    where: { teacherId_month: { teacherId, month: toDbDate(firstOfMonth(year, month)) } },
    include: {
      items: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
      payouts: { orderBy: { paidAt: "asc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
}

/** Строка ведомости (создаётся при первой премии, выплате или закрытии). */
async function ensurePayroll(db: Db, teacherId: string, year: number, month: number) {
  const m = toDbDate(firstOfMonth(year, month));
  return db.payroll.upsert({
    where: { teacherId_month: { teacherId, month: m } },
    create: { teacherId, month: m, hours: 0, baseAmount: 0, bonusPercent: 0, bonusAmount: 0, total: 0 },
    update: {},
  });
}

const earnedOf = (p: { baseAmount: number; bonusAmount: number }) => p.baseAmount + p.bonusAmount;

/**
 * Перерасчёт закрытых месяцев: отметки можно исправлять всегда, а закрытая сумма не меняется —
 * разница переносится строкой «Перерасчёт за <месяц>» в ведомость текущего месяца.
 */
export async function syncRecalc(db: RootDb, teacherId: string, today: LocalDate) {
  const { year, month } = parseLocalDate(today);
  const current = firstOfMonth(year, month);
  const closed = await db.payroll.findMany({
    where: { teacherId, status: { in: ["CLOSED", "PAID"] }, month: { lt: toDbDate(current), gte: toDbDate(addDays(current, -190)) } },
  });
  for (const p of closed) {
    const src = parseLocalDate(fromDbDate(p.month));
    const plan = await loadRatePlan(db, teacherId, fromDbDate(p.month));
    const now = monthPayroll((await actualAccruals(db, teacherId, src.year, src.month)).map((r) => r.accrual), plan).total;
    const carried = await db.payrollAdjustment.aggregate({
      where: { kind: "RECALC", sourceMonth: p.month, payroll: { teacherId, month: { not: toDbDate(current) } } },
      _sum: { amount: true },
    });
    const diff = now - earnedOf(p) - (carried._sum.amount ?? 0);
    const target = await db.payroll.findUnique({ where: { teacherId_month: { teacherId, month: toDbDate(current) } } });
    const existing = target
      ? await db.payrollAdjustment.findFirst({ where: { payrollId: target.id, kind: "RECALC", sourceMonth: p.month } })
      : null;
    if (diff === 0) {
      if (existing) await db.payrollAdjustment.delete({ where: { id: existing.id } });
      continue;
    }
    if (target && target.status !== "OPEN") continue;
    const payroll = target ?? (await ensurePayroll(db, teacherId, year, month));
    const reason = `Перерасчёт за ${String(src.month).padStart(2, "0")}.${src.year}: изменились отметки после закрытия`;
    if (existing) await db.payrollAdjustment.update({ where: { id: existing.id }, data: { amount: diff, reason } });
    else await db.payrollAdjustment.create({ data: { payrollId: payroll.id, kind: "RECALC", sourceMonth: p.month, amount: diff, reason } });
  }
}

/**
 * Ведомость педагога за месяц: проведённые уроки с начислением, надбавка, прогноз по расписанию,
 * премии/штрафы/перерасчёт, авансы и выплаты, статус месяца.
 * Для закрытого месяца сумма берётся из зафиксированной при закрытии.
 */
export async function teacherMonth(db: RootDb, teacherId: string, year: number, month: number, today: LocalDate) {
  const monthStart = firstOfMonth(year, month);
  const isCurrent = monthStart === monthStartOf(today);
  if (isCurrent) await syncRecalc(db, teacherId, today);

  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId }, select: { id: true, fullName: true, color: true } });
  const plan = await loadRatePlan(db, teacherId, monthStart);
  const rows = await actualAccruals(db, teacherId, year, month);
  const actual = monthPayroll(rows.map((r) => r.accrual), plan);
  const ended = monthStart < monthStartOf(today);
  const estimates = ended ? [] : await plannedEstimates(db, teacherId, year, month, plan);
  const forecast = monthPayroll([...rows.map((r) => r.accrual), ...estimates], plan);
  const p = await payrollRow(db, teacherId, year, month);
  const closed = p?.status === "CLOSED" || p?.status === "PAID";

  const adjustments = (p?.items ?? []).map((a) => ({
    id: a.id,
    amount: a.amount,
    reason: a.reason,
    kind: a.kind,
    at: a.createdAt.toISOString(),
    author: a.createdBy?.name ?? "система",
  }));
  const payments = (p?.payouts ?? []).map((x) => ({
    id: x.id,
    amount: x.amount,
    paidAt: x.paidAt.toISOString(),
    isAdvance: x.isAdvance,
    comment: x.comment,
    author: x.createdBy?.name ?? null,
    cancelled: x.cancelledAt ? (x.cancelReason ?? "отменена") : null,
  }));
  const earned = closed && p ? earnedOf(p) : actual.total;
  const totals = payrollTotals(
    earned,
    adjustments.map((a) => a.amount),
    payments.filter((x) => !x.cancelled).map((x) => x.amount),
  );

  return {
    teacher,
    month: monthStart,
    ended,
    status: (p?.status ?? "OPEN") as "OPEN" | "CLOSED" | "PAID",
    closedAt: p?.closedAt?.toISOString() ?? null,
    plan: { baseAmount: plan.baseAmount, groupPerStudent: plan.groupPerStudent, trialFixed: plan.trialFixed, bonusApply: plan.bonusApply, tiers: plan.tiers },
    lessons: rows.map((r) => ({ ...r.lesson, hours: r.accrual.hours, amount: r.accrual.amount, basis: r.accrual.basis })),
    actual,
    forecast,
    plannedCount: estimates.length,
    progress: tierProgress(actual.hours, plan.tiers),
    forecastProgress: tierProgress(forecast.hours, plan.tiers),
    snapshot: closed && p ? { hours: Number(p.hours), baseAmount: p.baseAmount, bonusPercent: Number(p.bonusPercent), bonusAmount: p.bonusAmount } : null,
    adjustments,
    payments,
    totals,
  };
}

export type TeacherMonth = Awaited<ReturnType<typeof teacherMonth>>;

/** Ведомость всех активных педагогов за месяц. */
export async function payrollSheet(db: RootDb, year: number, month: number, today: LocalDate) {
  const teachers = await db.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true } });
  const result: TeacherMonth[] = [];
  for (const t of teachers) result.push(await teacherMonth(db, t.id, year, month, today));
  return result;
}

// ───────────────────────── Действия с ведомостью ─────────────────────────

async function audit(db: Db, actorId: string, entityId: string, action: string, diff: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { entity: "Payroll", entityId, action, userId: actorId, diff } });
}

/** Премия «+» или штраф «−» — только в открытый месяц, с причиной. */
export async function addPayrollAdjustment(db: RootDb, actorId: string, teacherId: string, year: number, month: number, amount: number, reason: string) {
  if (!Number.isInteger(amount) || amount === 0) throw new DomainError("Укажите сумму");
  if (!reason.trim()) throw new DomainError("Укажите причину");
  const p = await ensurePayroll(db, teacherId, year, month);
  if (p.status !== "OPEN") throw new DomainError("Месяц закрыт — премию или штраф добавьте в текущий месяц");
  const a = await db.payrollAdjustment.create({ data: { payrollId: p.id, amount, reason: reason.trim(), createdById: actorId } });
  await audit(db, actorId, p.id, "adjust", { amount, reason });
  return a;
}

/** Аванс или выплата. После закрытия месяца статус становится «выплачено», когда выплачено всё. */
export async function addPayrollPayment(
  db: RootDb,
  actorId: string,
  teacherId: string,
  year: number,
  month: number,
  input: { amount: number; paidAt: Date; isAdvance: boolean; comment?: string | null },
  today: LocalDate,
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("Сумма должна быть больше нуля");
  const p = await ensurePayroll(db, teacherId, year, month);
  const pay = await db.payrollPayment.create({
    data: { payrollId: p.id, amount: input.amount, paidAt: input.paidAt, isAdvance: input.isAdvance, comment: input.comment?.trim() || null, createdById: actorId },
  });
  await audit(db, actorId, p.id, input.isAdvance ? "advance" : "payout", { amount: input.amount });
  await refreshPaid(db, teacherId, year, month, today);
  return pay;
}

/** Ошибочная выплата отменяется с причиной (запись остаётся в истории). */
export async function cancelPayrollPayment(db: RootDb, actorId: string, paymentId: string, reason: string, today: LocalDate) {
  if (!reason.trim()) throw new DomainError("Укажите причину");
  const pay = await db.payrollPayment.findUnique({ where: { id: paymentId }, include: { payroll: true } });
  if (!pay || pay.cancelledAt) throw new DomainError("Выплата не найдена");
  await db.payrollPayment.update({ where: { id: paymentId }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await audit(db, actorId, pay.payrollId, "cancelPayment", { paymentId, reason });
  const { year, month } = parseLocalDate(fromDbDate(pay.payroll.month));
  await refreshPaid(db, pay.payroll.teacherId, year, month, today);
}

async function refreshPaid(db: RootDb, teacherId: string, year: number, month: number, today: LocalDate) {
  const p = await payrollRow(db, teacherId, year, month);
  if (!p || p.status === "OPEN") return;
  const view = await teacherMonth(db, teacherId, year, month, today);
  const status = view.totals.toPay <= 0 ? "PAID" : "CLOSED";
  if (status !== p.status) await db.payroll.update({ where: { id: p.id }, data: { status } });
}

/** Закрыть месяц: фиксируются часы, начислено, надбавка и итог. Только завершившийся месяц. */
export async function closePayrollMonth(db: RootDb, actorId: string, teacherId: string, year: number, month: number, today: LocalDate) {
  const monthStart = firstOfMonth(year, month);
  if (monthStart >= monthStartOf(today)) throw new DomainError("Закрыть можно только завершившийся месяц");
  const existing = await payrollRow(db, teacherId, year, month);
  if (existing && existing.status !== "OPEN") throw new DomainError("Месяц уже закрыт");
  const view = await teacherMonth(db, teacherId, year, month, today);
  const unmarked = await db.lesson.count({ where: { teacherId, status: "PLANNED", startsAt: monthRange(year, month) } });
  const p = await ensurePayroll(db, teacherId, year, month);
  await db.payroll.update({
    where: { id: p.id },
    data: {
      hours: view.actual.hours,
      baseAmount: view.actual.baseAmount,
      bonusPercent: view.actual.bonusPercent,
      bonusAmount: view.actual.bonusAmount,
      adjustments: view.totals.adjustments,
      total: view.totals.total,
      status: view.totals.total - view.totals.paid <= 0 ? "PAID" : "CLOSED",
      closedAt: new Date(),
      closedById: actorId,
    },
  });
  await audit(db, actorId, p.id, "close", { total: view.totals.total, unmarked });
  return { total: view.totals.total, unmarked };
}
