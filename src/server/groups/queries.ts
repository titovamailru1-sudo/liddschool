import type { Prisma } from "@prisma/client";
import { addDays, firstOfMonth, fromDbDate, lastOfMonth, localDateOf, startOfDay, type LocalDate } from "@/domain/calendar";
import { isMemberAt, journalCell, journalSummary } from "@/domain/groups";
import { prisma } from "../db";
import type { CurrentUser } from "../session";

/** Педагог видит только свои группы — фильтр всегда на сервере. */
function scope(user: CurrentUser): Prisma.GroupWhereInput {
  return user.role === "TEACHER" ? { teacherId: user.teacherId ?? "—" } : {};
}

const activeSeries = (today: LocalDate) => ({ OR: [{ endsOn: null }, { endsOn: { gte: startOfDay(today) } }] });

export async function groupList(user: CurrentUser, today: LocalDate, archived = false) {
  const groups = await prisma.group.findMany({
    where: { ...scope(user), isActive: !archived },
    orderBy: { name: "asc" },
    include: {
      teacher: { select: { id: true, fullName: true, color: true } },
      members: { where: { leftAt: null }, select: { id: true } },
      series: { where: activeSeries(today), orderBy: [{ weekday: "asc" }, { startTime: "asc" }], select: { weekday: true, startTime: true, durationMin: true } },
      lessons: { where: { status: "PLANNED", startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    subject: g.subject,
    program: g.program,
    teacher: g.teacher,
    students: g.members.length,
    maxStudents: g.maxStudents,
    slots: g.series,
    nextLesson: g.lessons[0]?.startsAt.toISOString() ?? null,
  }));
}

export type GroupRow = Awaited<ReturnType<typeof groupList>>[number];

/** Карточка группы: состав, расписание и журнал посещаемости за месяц. */
export async function groupCard(user: CurrentUser, id: string, month: { year: number; month: number }, now: Date) {
  const g = await prisma.group.findFirst({
    where: { id, ...scope(user) },
    include: {
      teacher: { select: { id: true, fullName: true, color: true } },
      members: { include: { client: { select: { id: true, fullName: true, grade: true, paymentMode: true, status: true } } }, orderBy: { client: { fullName: "asc" } } },
      series: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }], include: { teacher: { select: { id: true, fullName: true, color: true } } } },
    },
  });
  if (!g) return null;

  const from = firstOfMonth(month.year, month.month);
  const to = lastOfMonth(month.year, month.month);
  const lessons = await prisma.lesson.findMany({
    where: { groupId: id, startsAt: { gte: startOfDay(from), lt: startOfDay(addDays(to, 1)) }, status: { not: "MOVED" } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, durationMin: true, status: true, attendances: { select: { clientId: true, status: true } } },
  });

  // В журнале — кто был в группе хотя бы на один урок месяца (или числится сейчас), плюс отмеченные посещения.
  const rows = g.members
    .map((m) => {
      const cells = lessons.map((l) => {
        const day = localDateOf(l.startsAt);
        const att = l.attendances.find((a) => a.clientId === m.clientId)?.status ?? null;
        return journalCell({
          member: isMemberAt(m, l.startsAt, startOfDay(addDays(day, 1))) || att !== null,
          lessonStatus: l.status,
          attendance: att,
          lessonEnded: l.startsAt.getTime() + l.durationMin * 60_000 < now.getTime(),
        });
      });
      return { client: m.client, joinedAt: localDateOf(m.joinedAt), leftAt: m.leftAt ? localDateOf(m.leftAt) : null, cells, summary: journalSummary(cells) };
    })
    .filter((r) => !r.leftAt || r.cells.some((c) => c !== "none"));

  const today = localDateOf(now);
  return {
    id: g.id,
    name: g.name,
    subject: g.subject,
    program: g.program,
    teacher: g.teacher,
    maxStudents: g.maxStudents,
    isActive: g.isActive,
    members: g.members
      .filter((m) => !m.leftAt || localDateOf(m.leftAt) > today)
      .map((m) => ({ ...m.client, joinedAt: localDateOf(m.joinedAt), leftAt: m.leftAt ? localDateOf(m.leftAt) : null })),
    former: g.members.filter((m) => m.leftAt && localDateOf(m.leftAt) <= today).map((m) => ({ ...m.client, leftAt: localDateOf(m.leftAt!) })),
    series: g.series.map((s) => ({
      id: s.id,
      weekday: s.weekday,
      startTime: s.startTime,
      durationMin: s.durationMin,
      subject: s.subject,
      teacher: s.teacher,
      startsOn: fromDbDate(s.startsOn),
      endsOn: s.endsOn ? fromDbDate(s.endsOn) : null,
    })),
    journal: {
      lessons: lessons.map((l) => ({ id: l.id, startsAt: l.startsAt.toISOString(), status: l.status })),
      rows,
    },
  };
}

export type GroupCard = NonNullable<Awaited<ReturnType<typeof groupCard>>>;
