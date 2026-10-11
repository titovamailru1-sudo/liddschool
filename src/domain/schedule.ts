import { SCHOOL_TZ } from "./constants";
import {
  daysInMonth,
  isoWeekday,
  localDate,
  parseTime,
  zonedInstant,
  type LocalDate,
} from "./calendar";

/** Регулярное занятие (ScheduleSeries) в виде, нужном для расчётов. */
export interface SeriesInput {
  id: string;
  weekday: number; // 1 = пн … 7 = вс
  startTime: string; // «16:00» в поясе школы
  durationMin: number;
  startsOn: LocalDate; // включительно
  endsOn: LocalDate | null; // включительно
}

export interface Occurrence {
  seriesId: string;
  localDate: LocalDate;
  weekday: number;
  startTime: string;
  startsAt: Date; // UTC
  durationMin: number;
}

function assertSeries(s: SeriesInput) {
  if (!Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7) {
    throw new RangeError(`День недели должен быть от 1 до 7: ${s.weekday}`);
  }
  parseTime(s.startTime);
}

/** Уроки серии в диапазоне календарных дат [from; to] (включительно), с учётом startsOn/endsOn. */
export function seriesOccurrencesInRange(
  s: SeriesInput,
  from: LocalDate,
  to: LocalDate,
  tz: string = SCHOOL_TZ,
): Occurrence[] {
  assertSeries(s);
  const start = s.startsOn > from ? s.startsOn : from;
  const end = s.endsOn !== null && s.endsOn < to ? s.endsOn : to;
  const result: Occurrence[] = [];
  if (start > end) return result;

  // Идём по дням через UTC-полночь: календарные даты от пояса не зависят.
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const d = cursor.toISOString().slice(0, 10);
    if (isoWeekday(d) === s.weekday) {
      result.push({
        seriesId: s.id,
        localDate: d,
        weekday: s.weekday,
        startTime: s.startTime,
        startsAt: zonedInstant(d, s.startTime, tz),
        durationMin: s.durationMin,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** Уроки серии в календарном месяце (month: 1–12). */
export function seriesOccurrencesInMonth(
  s: SeriesInput,
  year: number,
  month: number,
  tz: string = SCHOOL_TZ,
): Occurrence[] {
  return seriesOccurrencesInRange(
    s,
    localDate(year, month, 1),
    localDate(year, month, daysInMonth(year, month)),
    tz,
  );
}

/** Уроки нескольких серий за месяц, по порядку во времени. */
export function occurrencesInMonth(
  list: readonly SeriesInput[],
  year: number,
  month: number,
  tz: string = SCHOOL_TZ,
): Occurrence[] {
  return list
    .flatMap((s) => seriesOccurrencesInMonth(s, year, month, tz))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
