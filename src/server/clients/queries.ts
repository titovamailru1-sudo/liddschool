import type { Prisma } from "@prisma/client";
import { fromDbDate } from "@/domain/calendar";
import { lessonDisplayStatus } from "@/domain/lessonSettlement";
import { can } from "@/lib/access";
import { prisma } from "../db";
import type { CurrentUser } from "../session";

/** Ученики педагога: есть его уроки или расписание, либо состоят в его группах. */
function scope(user: CurrentUser): Prisma.ClientWhereInput {
  if (user.role !== "TEACHER") return {};
  const tid = user.teacherId ?? "—";
  return {
    OR: [
      { lessons: { some: { teacherId: tid } } },
      { series: { some: { teacherId: tid } } },
      { groupMembers: { some: { group: { teacherId: tid } } } },
    ],
  };
}

export interface ClientFilters {
  q?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "ALL";
  program?: "EXAM" | "SCHOOL";
  paymentMode?: "MONTHLY" | "PER_LESSON";
  teacherId?: string;
  debt?: boolean;
  sort?: "name" | "balance";
}

/**
 * Таблица клиентов. Поиск — по ФИО ученика, телефону и родителю. По умолчанию — без архива.
 * Баланс и фильтр «долг» — только тем, кто работает с оплатами.
 */
export async function clientList(user: CurrentUser, f: ClientFilters = {}) {
  const showMoney = can(user.role, "finance.payments");
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const where: Prisma.ClientWhereInput = {
    AND: [
      scope(user),
      f.status === "ALL" ? {} : f.status ? { status: f.status } : { status: { not: "ARCHIVED" } },
      f.program ? { program: f.program } : {},
      f.paymentMode ? { paymentMode: f.paymentMode } : {},
      f.teacherId
        ? { OR: [{ series: { some: { teacherId: f.teacherId } } }, { groupMembers: { some: { leftAt: null, group: { teacherId: f.teacherId } } } }] }
        : {},
      q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { parents: { some: { fullName: { contains: q, mode: "insensitive" } } } },
              ...(digits && digits.length >= 3
                ? [{ phone: { contains: digits.slice(-7) } }, { parents: { some: { phone: { contains: digits.slice(-4) } } } }]
                : []),
            ],
          }
        : {},
    ],
  };
  const clients = await prisma.client.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      grade: true,
      program: true,
      paymentMode: true,
      status: true,
      phone: true,
      parents: { orderBy: { isPrimary: "desc" }, take: 1, select: { fullName: true, phone: true, telegramChatId: true } },
      series: { where: { endsOn: null }, select: { subject: true, teacher: { select: { fullName: true, color: true } } } },
      groupMembers: { where: { leftAt: null }, select: { group: { select: { name: true, subject: true } } } },
    },
  });
  const balances = showMoney
    ? await prisma.ledgerEntry.groupBy({ by: ["clientId"], _sum: { amount: true }, where: { clientId: { in: clients.map((c) => c.id) } } })
    : [];
  const balanceOf = new Map(balances.map((b) => [b.clientId, b._sum.amount ?? 0]));
  let rows = clients.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    grade: c.grade,
    program: c.program,
    paymentMode: c.paymentMode,
    status: c.status,
    phone: c.phone,
    parent: c.parents[0] ? { fullName: c.parents[0].fullName, phone: c.parents[0].phone, telegram: !!c.parents[0].telegramChatId } : null,
    subjects: [...new Set([...c.series.map((s) => s.subject), ...c.groupMembers.map((m) => m.group.subject)])],
    teachers: [...new Map(c.series.map((s) => [s.teacher.fullName, s.teacher])).values()],
    groups: c.groupMembers.map((m) => m.group.name),
    balance: showMoney ? (balanceOf.get(c.id) ?? 0) : null,
  }));
  if (showMoney && f.debt) rows = rows.filter((r) => (r.balance ?? 0) < 0);
  if (showMoney && f.sort === "balance") rows.sort((a, b) => (a.balance ?? 0) - (b.balance ?? 0));
  return rows;
}

export type ClientRow = Awaited<ReturnType<typeof clientList>>[number];

export async function clientCard(user: CurrentUser, id: string, now: Date) {
  const c = await prisma.client.findFirst({
    where: { id, ...scope(user) },
    include: {
      parents: { orderBy: { isPrimary: "desc" } },
      series: {
        orderBy: [{ endsOn: { sort: "asc", nulls: "first" } }, { weekday: "asc" }],
        include: { teacher: { select: { id: true, fullName: true, color: true } } },
      },
      groupMembers: {
        where: { leftAt: null },
        include: {
          group: {
            include: {
              teacher: { select: { fullName: true } },
              series: { where: { OR: [{ endsOn: null }, { endsOn: { gte: now } }] } },
            },
          },
        },
      },
    },
  });
  if (!c) return null;
  const staff = user.role !== "TEACHER";

  const upcoming = await prisma.lesson.findMany({
    where: {
      startsAt: { gte: new Date(now.getTime() - 12 * 3_600_000) },
      status: { in: ["PLANNED", "DONE"] },
      OR: [{ clientId: c.id }, { group: { members: { some: { clientId: c.id, leftAt: null } } } }],
      ...(user.role === "TEACHER" ? { teacherId: user.teacherId ?? "—" } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 8,
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      subject: true,
      status: true,
      group: { select: { name: true } },
      teacher: { select: { fullName: true, color: true } },
    },
  });

  const balance = can(user.role, "finance.payments")
    ? ((await prisma.ledgerEntry.aggregate({ where: { clientId: c.id }, _sum: { amount: true } }))._sum.amount ?? 0)
    : null;

  // История посещений: уроки до сегодняшнего дня (последние 60).
  const visits = await prisma.lesson.findMany({
    where: {
      startsAt: { lt: now },
      OR: [{ clientId: c.id }, { group: { members: { some: { clientId: c.id } } } }],
      ...(user.role === "TEACHER" ? { teacherId: user.teacherId ?? "—" } : {}),
    },
    orderBy: { startsAt: "desc" },
    take: 60,
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      subject: true,
      status: true,
      cancelledBy: true,
      groupId: true,
      topic: true,
      group: { select: { name: true } },
      teacher: { select: { fullName: true, color: true } },
      attendances: { where: { clientId: c.id }, select: { status: true } },
    },
  });

  return {
    id: c.id,
    fullName: c.fullName,
    grade: c.grade,
    program: c.program,
    paymentMode: c.paymentMode,
    status: c.status,
    goal: c.goal,
    gender: c.gender,
    fullNameGen: c.fullNameGen,
    school: c.school,
    phone: staff ? c.phone : null,
    source: c.source,
    notes: staff ? c.notes : null,
    balance,
    // Контакты родителей — только сотрудникам школы.
    parents: staff
      ? c.parents.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          relation: p.relation,
          phone: p.phone,
          telegramLinkedAt: p.telegramChatId ? (p.telegramLinkedAt?.toISOString() ?? "") : null,
        }))
      : [],
    series: c.series
      .filter((s) => staff || s.teacherId === user.teacherId)
      .map((s) => ({
        id: s.id,
        weekday: s.weekday,
        startTime: s.startTime,
        durationMin: s.durationMin,
        subject: s.subject,
        teacher: s.teacher,
        startsOn: fromDbDate(s.startsOn),
        endsOn: s.endsOn ? fromDbDate(s.endsOn) : null,
      })),
    groups: c.groupMembers.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      teacher: m.group.teacher.fullName,
      slots: m.group.series.map((s) => ({ weekday: s.weekday, startTime: s.startTime, durationMin: s.durationMin })),
    })),
    upcoming: upcoming.map((l) => ({
      id: l.id,
      startsAt: l.startsAt.toISOString(),
      durationMin: l.durationMin,
      subject: l.subject,
      status: l.status,
      title: l.group ? `Группа ${l.group.name}` : "Индивидуально",
      teacher: l.teacher,
    })),
    visits: visits.map((l) => ({
      id: l.id,
      startsAt: l.startsAt.toISOString(),
      durationMin: l.durationMin,
      subject: l.subject,
      topic: l.topic,
      title: l.group ? `Группа ${l.group.name}` : "Индивидуально",
      teacher: l.teacher,
      status: lessonDisplayStatus(l.status, l.cancelledBy, !!l.groupId, l.attendances.map((a) => a.status)),
      // В группе у ученика своя отметка.
      ownStatus: l.groupId && l.attendances[0] ? l.attendances[0].status : null,
    })),
  };
}

export type ClientCard = NonNullable<Awaited<ReturnType<typeof clientCard>>>;
