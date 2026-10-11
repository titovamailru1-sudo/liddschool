import type { Prisma } from "@prisma/client";
import { fromDbDate } from "@/domain/calendar";
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

export async function clientList(user: CurrentUser, q?: string) {
  const showMoney = can(user.role, "finance.payments");
  const clients = await prisma.client.findMany({
    where: {
      ...scope(user),
      status: { not: "ARCHIVED" },
      ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      grade: true,
      program: true,
      paymentMode: true,
      series: { where: { endsOn: null }, select: { teacher: { select: { fullName: true, color: true } } } },
      groupMembers: { where: { leftAt: null }, select: { group: { select: { name: true } } } },
    },
  });
  const balances = showMoney
    ? await prisma.ledgerEntry.groupBy({ by: ["clientId"], _sum: { amount: true }, where: { clientId: { in: clients.map((c) => c.id) } } })
    : [];
  const balanceOf = new Map(balances.map((b) => [b.clientId, b._sum.amount ?? 0]));
  return clients.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    grade: c.grade,
    program: c.program,
    paymentMode: c.paymentMode,
    teachers: [...new Map(c.series.map((s) => [s.teacher.fullName, s.teacher])).values()],
    groups: c.groupMembers.map((m) => m.group.name),
    balance: showMoney ? (balanceOf.get(c.id) ?? 0) : null,
  }));
}

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

  return {
    id: c.id,
    fullName: c.fullName,
    grade: c.grade,
    program: c.program,
    paymentMode: c.paymentMode,
    status: c.status,
    goal: c.goal,
    balance,
    // Контакты родителей — только сотрудникам школы.
    parents: staff ? c.parents.map((p) => ({ id: p.id, fullName: p.fullName, relation: p.relation, phone: p.phone })) : [],
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
  };
}

export type ClientCard = NonNullable<Awaited<ReturnType<typeof clientCard>>>;
