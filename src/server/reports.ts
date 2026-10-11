import { addDays, firstOfMonth, lastOfMonth, parseLocalDate, startOfDay, toDbDate, type LocalDate } from "@/domain/calendar";
import { wholeMonths, type Period } from "@/domain/crm";
import { lessonHours } from "@/domain/pricing";
import { monthPayroll, type Accrual } from "@/domain/payroll";
import { loadRatePlan, type Db } from "./lessons/context";

/** Интервал моментов для календарного периода [from; to]. */
const range = (p: Period) => ({ gte: startOfDay(p.from), lt: startOfDay(addDays(p.to, 1)) });

/**
 * Финансовые показатели за период:
 * - поступления — пришедшие платежи (без отменённых);
 * - выручка — стоимость проведённых уроков (неуважительный пропуск считается, уважительный — нет, пробные — бесплатно);
 * - зарплаты — начисления за уроки периода + премии/штрафы/перерасчёт периода + надбавка за целые месяцы периода;
 * - прибыль = выручка − зарплаты − расходы.
 */
export async function financials(db: Db, p: Period) {
  const r = range(p);
  const [payments, attendances, accruals, adjustments, expenses] = await Promise.all([
    db.payment.aggregate({ where: { paidAt: r, cancelledAt: null }, _sum: { amount: true } }),
    db.attendance.aggregate({
      where: { status: { not: "ABSENT_EXCUSED" }, lesson: { status: "DONE", isTrial: false, startsAt: r } },
      _sum: { price: true },
    }),
    db.teacherAccrual.aggregate({ where: { lesson: { startsAt: r } }, _sum: { amount: true } }),
    db.payrollAdjustment.aggregate({ where: { createdAt: r }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { date: { gte: toDbDate(p.from), lte: toDbDate(p.to) }, cancelledAt: null }, _sum: { amount: true } }),
  ]);
  const bonus = await bonusForWholeMonths(db, p);
  const revenue = attendances._sum.price ?? 0;
  const salaries = (accruals._sum.amount ?? 0) + (adjustments._sum.amount ?? 0) + bonus.total;
  const exp = expenses._sum.amount ?? 0;
  return {
    receipts: payments._sum.amount ?? 0,
    revenue,
    salaries,
    expenses: exp,
    profit: revenue - salaries - exp,
    bonusIncluded: bonus.months > 0,
    bonusByTeacher: bonus.byTeacher,
  };
}

/** Надбавка за объём считается за месяц — в отчёт попадает только за месяцы, целиком входящие в период. */
async function bonusForWholeMonths(db: Db, p: Period) {
  const months = wholeMonths(p);
  const byTeacher = new Map<string, number>();
  let total = 0;
  for (const m of months) {
    const mr = range({ from: firstOfMonth(m.year, m.month), to: lastOfMonth(m.year, m.month) });
    const rows = await db.teacherAccrual.findMany({ where: { lesson: { startsAt: mr } }, select: { teacherId: true, hours: true, hourlyAmount: true, extraAmount: true, amount: true, basis: true } });
    const teachers = [...new Set(rows.map((x) => x.teacherId))];
    for (const t of teachers) {
      const plan = await loadRatePlan(db, t, firstOfMonth(m.year, m.month));
      const acc: Accrual[] = rows.filter((x) => x.teacherId === t).map((x) => ({ ...x, hours: Number(x.hours) }));
      const b = monthPayroll(acc, plan).bonusAmount;
      byTeacher.set(t, (byTeacher.get(t) ?? 0) + b);
      total += b;
    }
  }
  return { total, months: months.length, byTeacher };
}

/** Помесячная динамика для графиков: последние n месяцев, заканчивая месяцем даты to. */
export async function monthlySeries(db: Db, to: LocalDate, n = 6) {
  let { year, month } = parseLocalDate(to);
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < n; i++) {
    months.unshift({ year, month });
    month--;
    if (month === 0) [year, month] = [year - 1, 12];
  }
  const result = [];
  for (const m of months) {
    const f = await financials(db, { from: firstOfMonth(m.year, m.month), to: lastOfMonth(m.year, m.month) });
    result.push({ key: `${m.year}-${String(m.month).padStart(2, "0")}`, ...f, bonusByTeacher: undefined });
  }
  return result;
}

/** По педагогам: уроки, часы, принесённая выручка, зарплата, маржа. */
export async function byTeacher(db: Db, p: Period) {
  const r = range(p);
  const teachers = await db.teacher.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true, color: true } });
  const fin = await financials(db, p);
  const rows = [];
  for (const t of teachers) {
    const [lessons, revenue, accrual, adjustments] = await Promise.all([
      db.lesson.findMany({ where: { teacherId: t.id, status: "DONE", startsAt: r }, select: { durationMin: true } }),
      db.attendance.aggregate({ where: { status: { not: "ABSENT_EXCUSED" }, lesson: { teacherId: t.id, status: "DONE", isTrial: false, startsAt: r } }, _sum: { price: true } }),
      db.teacherAccrual.aggregate({ where: { teacherId: t.id, lesson: { startsAt: r } }, _sum: { amount: true, hours: true } }),
      db.payrollAdjustment.aggregate({ where: { createdAt: r, payroll: { teacherId: t.id } }, _sum: { amount: true } }),
    ]);
    if (!lessons.length && !accrual._sum.amount) continue;
    const salary = (accrual._sum.amount ?? 0) + (adjustments._sum.amount ?? 0) + (fin.bonusByTeacher.get(t.id) ?? 0);
    const rev = revenue._sum.price ?? 0;
    rows.push({
      id: t.id,
      fullName: t.fullName,
      color: t.color,
      lessons: lessons.length,
      hours: lessons.reduce((s, l) => s + lessonHours(l.durationMin), 0),
      revenue: rev,
      salary,
      margin: rev - salary,
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue);
}

/** По программам и тарифам: выручка проведённых уроков по программе, формату (индивидуально/группа) и способу оплаты. */
export async function byProgram(db: Db, p: Period) {
  const rows = await db.attendance.findMany({
    where: { status: { not: "ABSENT_EXCUSED" }, lesson: { status: "DONE", isTrial: false, startsAt: range(p) } },
    select: { price: true, paymentMode: true, lesson: { select: { program: true, groupId: true, durationMin: true } } },
  });
  const map = new Map<string, { program: "EXAM" | "SCHOOL"; kind: "INDIVIDUAL" | "GROUP"; paymentMode: "MONTHLY" | "PER_LESSON"; visits: number; hours: number; revenue: number }>();
  for (const r of rows) {
    const kind = r.lesson.groupId ? "GROUP" : "INDIVIDUAL";
    const key = `${r.lesson.program}|${kind}|${r.paymentMode}`;
    const x = map.get(key) ?? { program: r.lesson.program, kind, paymentMode: r.paymentMode, visits: 0, hours: 0, revenue: 0 };
    x.visits++;
    x.hours += lessonHours(r.lesson.durationMin);
    x.revenue += r.price;
    map.set(key, x);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Посещаемость: доли проведённых, отменённых, пропущенных уроков за период (без перенесённых — они учтены в новом уроке). */
export async function attendanceStats(db: Db, p: Period) {
  const lessons = await db.lesson.findMany({
    where: { startsAt: range(p), status: { not: "MOVED" } },
    select: { status: true, cancelledBy: true, groupId: true, attendances: { select: { status: true } } },
  });
  const c = { done: 0, unexcused: 0, excused: 0, cancelled: 0, planned: 0 };
  for (const l of lessons) {
    if (l.status === "PLANNED") c.planned++;
    else if (l.status === "CANCELLED") {
      if (l.cancelledBy === "CLIENT" && !l.groupId) c.excused++;
      else c.cancelled++;
    } else if (!l.groupId && l.attendances[0]?.status === "ABSENT_UNEXCUSED") c.unexcused++;
    else c.done++;
  }
  const past = c.done + c.unexcused + c.excused + c.cancelled;
  const share = (n: number) => (past ? Math.round((n / past) * 1000) / 10 : 0);
  return { counts: c, total: past, shares: { done: share(c.done), unexcused: share(c.unexcused), excused: share(c.excused), cancelled: share(c.cancelled) } };
}

/**
 * Клиенты: активные (был проведённый урок в периоде), новые (созданы в периоде), ушедшие (переведены в архив
 * в периоде), отток = ушедшие / активные на начало периода (у кого были уроки в предыдущем периоде).
 */
export async function clientStats(db: Db, p: Period, prev: Period) {
  const active = async (q: Period) => {
    const [ind, grp] = await Promise.all([
      db.lesson.findMany({ where: { status: "DONE", startsAt: range(q), clientId: { not: null } }, select: { clientId: true }, distinct: ["clientId"] }),
      db.attendance.findMany({ where: { status: { not: "ABSENT_EXCUSED" }, lesson: { status: "DONE", startsAt: range(q) } }, select: { clientId: true }, distinct: ["clientId"] }),
    ]);
    return new Set([...ind.map((x) => x.clientId!), ...grp.map((x) => x.clientId)]);
  };
  const [now, before, created, archived] = await Promise.all([
    active(p),
    active(prev),
    db.client.count({ where: { createdAt: range(p) } }),
    db.auditLog.findMany({ where: { entity: "Client", action: { in: ["status", "update"] }, at: range(p) }, select: { entityId: true, diff: true } }),
  ]);
  const left = new Set(
    archived.filter((a) => (a.diff as { status?: string } | null)?.status === "ARCHIVED").map((a) => a.entityId),
  );
  return {
    active: now.size,
    newClients: created,
    left: left.size,
    churn: before.size ? Math.round((left.size / before.size) * 1000) / 10 : 0,
  };
}

/** Сумма долгов на сегодня — отрицательные балансы клиентов. */
export async function totalDebt(db: Db) {
  const sums = await db.ledgerEntry.groupBy({ by: ["clientId"], _sum: { amount: true } });
  return sums.reduce((s, x) => s + Math.min(0, x._sum.amount ?? 0), 0) * -1;
}

/** Весь отчёт за период со сравнением с предыдущим. */
export async function fullReport(db: Db, p: Period, prev: Period) {
  const [cur, before, series, teachers, programs, attendance, clients, debt] = await Promise.all([
    financials(db, p),
    financials(db, prev),
    monthlySeries(db, p.to),
    byTeacher(db, p),
    byProgram(db, p),
    attendanceStats(db, p),
    clientStats(db, p, prev),
    totalDebt(db),
  ]);
  const strip = ({ bonusByTeacher, ...x }: typeof cur) => {
    void bonusByTeacher;
    return x;
  };
  return { period: p, previous: prev, current: strip(cur), before: strip(before), series, teachers, programs, attendance, clients, debt };
}

export type FullReport = Awaited<ReturnType<typeof fullReport>>;
