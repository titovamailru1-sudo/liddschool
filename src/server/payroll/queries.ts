import { addDays, firstOfMonth, fromDbDate, lastOfMonth, parseLocalDate, startOfDay, type LocalDate } from "@/domain/calendar";
import { can } from "@/lib/access";
import { prisma } from "../db";
import type { CurrentUser } from "../session";
import { teacherMonth } from "./payroll";

/**
 * Список педагогов за текущий месяц: уроки, часы и шкала надбавки.
 * Деньги (начислено, прогноз, проценты надбавки) — только владельцу; администратору они даже не уходят с сервера.
 */
export async function teachersOverview(user: CurrentUser, today: LocalDate, includeInactive = false) {
  const money = can(user.role, "teachers.rates");
  const { year, month } = parseLocalDate(today);
  const range = { gte: startOfDay(firstOfMonth(year, month)), lt: startOfDay(addDays(lastOfMonth(year, month), 1)) };
  const teachers = await prisma.teacher.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { fullName: "asc" },
    include: { user: { select: { email: true, passwordHash: true } } },
  });
  const rows = [];
  for (const t of teachers) {
    const m = await teacherMonth(prisma, t.id, year, month, today);
    const lessons = await prisma.lesson.findMany({
      where: { teacherId: t.id, startsAt: range, status: { in: ["PLANNED", "DONE"] } },
      select: { clientId: true, groupId: true },
    });
    const groupIds = [...new Set(lessons.map((l) => l.groupId).filter(Boolean))] as string[];
    const members = groupIds.length ? await prisma.groupMember.findMany({ where: { groupId: { in: groupIds }, leftAt: null }, select: { clientId: true } }) : [];
    const students = new Set([...lessons.map((l) => l.clientId).filter(Boolean), ...members.map((x) => x.clientId)]);
    rows.push({
      id: t.id,
      fullName: t.fullName,
      color: t.color,
      subjects: t.subjects,
      isActive: t.isActive,
      login: t.user ? (t.user.passwordHash === "!" ? ("invited" as const) : ("active" as const)) : ("none" as const),
      students: students.size,
      lessonsDone: m.lessons.length,
      lessonsTotal: lessons.length,
      hours: m.actual.hours,
      forecastHours: m.forecast.hours,
      tiers: money ? m.plan.tiers : m.plan.tiers.map((x) => ({ thresholdHours: x.thresholdHours, bonusPercent: 0 })),
      hoursLeft: m.progress.next?.hoursLeft ?? null,
      money: money ? { earned: m.totals.earned, forecast: m.forecast.total, total: m.totals.total, toPay: m.totals.toPay, baseAmount: m.plan.baseAmount } : null,
    });
  }
  return rows;
}

export type TeacherRow = Awaited<ReturnType<typeof teachersOverview>>[number];

/** Карточка педагога: профиль, вход, регулярное расписание. */
export async function teacherCard(id: string) {
  const t = await prisma.teacher.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, passwordHash: true, isActive: true } },
      series: {
        where: { OR: [{ endsOn: null }, { endsOn: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
        include: { client: { select: { id: true, fullName: true } }, group: { select: { id: true, name: true } } },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    fullName: t.fullName,
    phone: t.phone,
    color: t.color,
    subjects: t.subjects,
    onlineUrl: t.onlineUrl,
    isActive: t.isActive,
    email: t.user?.email ?? null,
    login: t.user ? (t.user.passwordHash === "!" ? ("invited" as const) : ("active" as const)) : ("none" as const),
    series: t.series.map((s) => ({
      id: s.id,
      weekday: s.weekday,
      startTime: s.startTime,
      durationMin: s.durationMin,
      subject: s.subject,
      title: s.client?.fullName ?? `Группа ${s.group?.name ?? ""}`,
      href: s.client ? `/clients/${s.client.id}?tab=schedule` : null,
      startsOn: fromDbDate(s.startsOn),
      endsOn: s.endsOn ? fromDbDate(s.endsOn) : null,
    })),
  };
}

export type TeacherCardData = NonNullable<Awaited<ReturnType<typeof teacherCard>>>;
