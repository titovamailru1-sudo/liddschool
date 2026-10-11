import type { Prisma } from "@prisma/client";
import { localDateOf, type LocalDate } from "@/domain/calendar";
import { lessonDisplayStatus, settleLesson, type LessonDisplayStatus } from "@/domain/lessonSettlement";
import { can } from "@/lib/access";
import { prisma } from "../db";
import type { CurrentUser } from "../session";
import { lessonHours, lessonPrice } from "@/domain/pricing";
import { loadLessonStudents, loadRatePlan, loadTariffs } from "./context";
import { instantRange } from "./generation";

export interface CalendarFilters {
  teacherId?: string;
  subject?: string;
  clientId?: string;
  groupId?: string;
  status?: LessonDisplayStatus;
}

export interface CalendarLesson {
  id: string;
  startsAt: string; // ISO
  durationMin: number;
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  title: string;
  subject: string;
  isGroup: boolean;
  status: LessonDisplayStatus;
  atRisk: boolean; // поурочник не оплатил к дедлайну
}

/** Название урока: ученик, группа или пробный урок лида. */
export function lessonTitle(l: { client?: { fullName: string } | null; group?: { name: string } | null; trialForLead?: { childName: string } | null }) {
  if (l.client) return l.client.fullName;
  if (l.group) return `Группа ${l.group.name}`;
  if (l.trialForLead) return `Пробный: ${l.trialForLead.childName}`;
  return "Урок";
}

/** Педагог видит только свои уроки — фильтр всегда на сервере. */
function scope(user: CurrentUser): Prisma.LessonWhereInput {
  return user.role === "TEACHER" ? { teacherId: user.teacherId ?? "—" } : {};
}

export async function calendarLessons(
  user: CurrentUser,
  from: LocalDate,
  to: LocalDate,
  f: CalendarFilters,
): Promise<CalendarLesson[]> {
  const where: Prisma.LessonWhereInput = {
    ...scope(user),
    startsAt: instantRange(from, to),
    ...(f.teacherId && user.role !== "TEACHER" ? { teacherId: f.teacherId } : {}),
    ...(f.subject ? { subject: f.subject } : {}),
    ...(f.groupId ? { groupId: f.groupId } : {}),
    ...(f.clientId ? { OR: [{ clientId: f.clientId }, { group: { members: { some: { clientId: f.clientId } } } }] } : {}),
  };
  const rows = await prisma.lesson.findMany({
    where,
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      subject: true,
      status: true,
      cancelledBy: true,
      groupId: true,
      teacher: { select: { id: true, fullName: true, color: true } },
      client: { select: { fullName: true } },
      group: { select: { name: true } },
      trialForLead: { select: { childName: true } },
      attendances: { select: { status: true } },
      paymentLinks: { where: { atRiskAt: { not: null } }, select: { id: true } },
    },
  });
  const lessons = rows.map((l) => ({
    id: l.id,
    startsAt: l.startsAt.toISOString(),
    durationMin: l.durationMin,
    teacherId: l.teacher.id,
    teacherName: l.teacher.fullName,
    teacherColor: l.teacher.color,
    title: lessonTitle(l),
    subject: l.subject,
    isGroup: !!l.groupId,
    status: lessonDisplayStatus(l.status, l.cancelledBy, !!l.groupId, l.attendances.map((a) => a.status)),
    atRisk: l.status === "PLANNED" && l.paymentLinks.length > 0,
  }));
  return f.status ? lessons.filter((l) => l.status === f.status) : lessons;
}

/** Сводка дня: уроков, неотмеченных прошедших, выручка (стоимость проведённых) — выручку видит только владелец. */
export async function daySummary(user: CurrentUser, day: LocalDate, now: Date) {
  const lessons = await prisma.lesson.findMany({
    where: { ...scope(user), startsAt: instantRange(day, day), status: { not: "MOVED" } },
    select: { status: true, startsAt: true, durationMin: true, attendances: { select: { status: true, price: true } } },
  });
  const unmarked = lessons.filter(
    (l) => l.status === "PLANNED" && l.startsAt.getTime() + l.durationMin * 60_000 < now.getTime(),
  ).length;
  const revenue = can(user.role, "lessons.finance")
    ? lessons
        .filter((l) => l.status === "DONE")
        .flatMap((l) => l.attendances)
        .filter((a) => a.status !== "ABSENT_EXCUSED")
        .reduce((s, a) => s + a.price, 0)
    : null;
  return { total: lessons.filter((l) => l.status !== "CANCELLED").length, unmarked, revenue };
}

export async function lessonDetail(user: CurrentUser, id: string) {
  const l = await prisma.lesson.findFirst({
    where: { id, ...scope(user) },
    include: {
      teacher: { select: { id: true, fullName: true, color: true } },
      client: { select: { id: true, fullName: true, paymentMode: true } },
      group: { select: { id: true, name: true } },
      trialForLead: { select: { id: true, childName: true } },
      attendances: { select: { clientId: true, status: true, price: true, paymentMode: true } },
      accruals: { select: { amount: true, hours: true, basis: true } },
      movedTo: { select: { id: true, startsAt: true } },
      movedFrom: { select: { id: true, startsAt: true } },
      createdBy: { select: { name: true } },
      markedBy: { select: { name: true } },
      series: { select: { startsOn: true, endsOn: true } },
      paymentLinks: { select: { clientId: true, token: true, sentAt: true, atRiskAt: true } },
      payments: { where: { cancelledAt: null }, select: { clientId: true, amount: true } },
    },
  });
  if (!l) return null;

  const tariffs = await loadTariffs(prisma);
  const students = await loadLessonStudents(prisma, l, tariffs);
  const attendanceById = new Map(l.attendances.map((a) => [a.clientId, a]));

  // «Финансы урока» — только владельцу; для неотмеченного урока — оценка, как если бы все пришли.
  let finance: null | {
    estimated: boolean;
    students: { clientId: string; fullName: string; paymentMode: string; price: number; charged: boolean }[];
    revenue: number;
    accrual: number;
    accrualBasis: string;
    margin: number;
  } = null;
  if (can(user.role, "lessons.finance") && students.length) {
    const marked = l.status === "DONE";
    const settlement = marked
      ? null
      : settleLesson({
          durationMin: l.durationMin,
          isTrial: l.isTrial,
          isGroup: !!l.groupId,
          students,
          outcome: { kind: "DONE", attendance: Object.fromEntries(students.map((s) => [s.clientId, "PRESENT" as const])) },
          plan: await loadRatePlan(prisma, l.teacherId, localDateOf(l.startsAt)),
        });
    const rows = students.map((s) => {
      const a = attendanceById.get(s.clientId);
      const price = marked ? (a?.price ?? 0) : settlement!.attendances.find((x) => x.clientId === s.clientId)!.price;
      const counts = marked ? !!a && a.status !== "ABSENT_EXCUSED" : true;
      return { clientId: s.clientId, fullName: s.fullName, paymentMode: s.paymentMode, price: counts ? price : 0, charged: counts };
    });
    const revenue = rows.reduce((sum, r) => sum + r.price, 0);
    const accrual = marked ? (l.accruals[0]?.amount ?? 0) : settlement!.accrual.amount;
    const accrualBasis = marked ? (l.accruals[0]?.basis ?? "Не начисляется") : settlement!.accrual.basis;
    finance = { estimated: !marked, students: rows, revenue, accrual, accrualBasis, margin: revenue - accrual };
  }

  return {
    id: l.id,
    startsAt: l.startsAt.toISOString(),
    durationMin: l.durationMin,
    subject: l.subject,
    status: l.status,
    displayStatus: lessonDisplayStatus(l.status, l.cancelledBy, !!l.groupId, l.attendances.map((a) => a.status)),
    cancelledBy: l.cancelledBy,
    cancelReason: l.cancelReason,
    isGroup: !!l.groupId,
    isTrial: l.isTrial,
    title: lessonTitle(l),
    leadId: l.trialForLead?.id ?? null,
    clientId: l.client?.id ?? null,
    groupId: l.group?.id ?? null,
    teacher: l.teacher,
    onlineUrl: l.onlineUrl,
    topic: l.topic,
    homework: l.homework,
    comment: l.comment,
    seriesId: l.seriesId,
    movedTo: l.movedTo ? { id: l.movedTo.id, startsAt: l.movedTo.startsAt.toISOString() } : null,
    movedFrom: l.movedFrom ? { id: l.movedFrom.id, startsAt: l.movedFrom.startsAt.toISOString() } : null,
    createdBy: l.createdBy?.name ?? null,
    markedBy: l.markedBy?.name ?? null,
    markedAt: l.markedAt?.toISOString() ?? null,
    students: students.map((s) => ({
      clientId: s.clientId,
      fullName: s.fullName,
      attendance: attendanceById.get(s.clientId)?.status ?? null,
    })),
    // Поурочная оплата — ученикам на поурочной оплате; видят сотрудники с доступом к платежам.
    perLesson: can(user.role, "finance.payments")
      ? students
          .filter((s) => s.paymentMode === "PER_LESSON" && !l.isTrial)
          .map((s) => {
            const price = lessonPrice(lessonHours(l.durationMin), s.pricePerHour);
            const paid = l.payments.filter((p) => p.clientId === s.clientId).reduce((sum, p) => sum + p.amount, 0);
            const link = l.paymentLinks.find((x) => x.clientId === s.clientId);
            const state = paid >= price ? "paid" : link?.atRiskAt ? "atRisk" : link?.sentAt ? "linkSent" : "pending";
            return { clientId: s.clientId, fullName: s.fullName, price, state: state as "paid" | "atRisk" | "linkSent" | "pending" };
          })
      : [],
    finance,
  };
}

export type LessonDetail = NonNullable<Awaited<ReturnType<typeof lessonDetail>>>;

/** Справочники для форм. Педагог получает только себя, своих учеников и свои группы. */
export async function lessonFormOptions(user: CurrentUser) {
  const teacherOnly = user.role === "TEACHER";
  const tid = user.teacherId ?? "—";
  const [teachers, clients, groups] = await Promise.all([
    prisma.teacher.findMany({
      where: { isActive: true, ...(teacherOnly ? { id: tid } : {}) },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, color: true, subjects: true, onlineUrl: true },
    }),
    prisma.client.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...(teacherOnly
          ? { OR: [{ lessons: { some: { teacherId: tid } } }, { groupMembers: { some: { group: { teacherId: tid } } } }] }
          : {}),
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, program: true, paymentMode: true },
    }),
    prisma.group.findMany({
      where: { isActive: true, ...(teacherOnly ? { teacherId: tid } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, program: true, teacherId: true },
    }),
  ]);
  const subjects = [
    ...new Set(["математика", "информатика", ...groups.map((g) => g.subject), ...teachers.flatMap((t) => t.subjects)]),
  ].filter((s) => s === s.toLowerCase() || s === "Python");
  return { teachers, clients, groups, subjects };
}

export type LessonFormOptions = Awaited<ReturnType<typeof lessonFormOptions>>;
