import type { Prisma } from "@prisma/client";
import { addDays, fromDbDate, startOfDay, type LocalDate } from "@/domain/calendar";
import { seriesOccurrencesInRange, type SeriesInput } from "@/domain/schedule";
import type { Db } from "./context";

type SeriesRow = Prisma.ScheduleSeriesGetPayload<object>;

export function toSeriesInput(s: SeriesRow): SeriesInput {
  return {
    id: s.id,
    weekday: s.weekday,
    startTime: s.startTime,
    durationMin: s.durationMin,
    startsOn: fromDbDate(s.startsOn),
    endsOn: s.endsOn ? fromDbDate(s.endsOn) : null,
  };
}

/**
 * Создаёт уроки серий в диапазоне дат. Повторный вызов безопасен: уникальность (seriesId, startsAt)
 * не даёт дублей, а перенесённые/отменённые уроки остаются на своих местах и заново не создаются.
 */
export async function generateLessons(db: Db, series: readonly SeriesRow[], from: LocalDate, to: LocalDate) {
  const data: Prisma.LessonCreateManyInput[] = [];
  for (const s of series) {
    for (const o of seriesOccurrencesInRange(toSeriesInput(s), from, to)) {
      data.push({
        seriesId: s.id,
        teacherId: s.teacherId,
        clientId: s.clientId,
        groupId: s.groupId,
        subject: s.subject,
        program: s.program,
        startsAt: o.startsAt,
        durationMin: o.durationMin,
        format: s.format,
        roomId: s.roomId,
        onlineUrl: s.onlineUrl,
        createdById: s.createdById,
      });
    }
  }
  if (!data.length) return 0;
  const { count } = await db.lesson.createMany({ data, skipDuplicates: true });
  return count;
}

/** Досоздать уроки всех действующих серий в диапазоне — вызывается при просмотре календаря. */
export async function ensureLessons(db: Db, from: LocalDate, to: LocalDate) {
  const series = await db.scheduleSeries.findMany({
    where: {
      startsOn: { lte: new Date(`${to}T00:00:00Z`) },
      OR: [{ endsOn: null }, { endsOn: { gte: new Date(`${from}T00:00:00Z`) } }],
    },
  });
  return generateLessons(db, series, from, to);
}

/**
 * Удалить запланированные уроки серии начиная с даты (после сокращения срока или изменения серии).
 * Проведённые, отменённые и перенесённые уроки — история, их не трогаем.
 */
export async function dropPlannedLessonsFrom(db: Db, seriesId: string, from: LocalDate) {
  const { count } = await db.lesson.deleteMany({
    where: { seriesId, status: "PLANNED", startsAt: { gte: startOfDay(from) }, attendances: { none: {} } },
  });
  return count;
}

/** Диапазон [from; to] → интервал моментов [начало from; начало to+1). */
export function instantRange(from: LocalDate, to: LocalDate) {
  return { gte: startOfDay(from), lt: startOfDay(addDays(to, 1)) };
}
