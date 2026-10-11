import { TZDate } from "@date-fns/tz";
import { SCHOOL_TZ } from "./constants";

/**
 * Календарная дата без времени в поясе школы: «2026-11-01».
 * Строки в таком формате корректно сравниваются через < и >.
 */
export type LocalDate = string;

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, "0");

export function localDate(year: number, month: number, day: number): LocalDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseLocalDate(d: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_RE.exec(d);
  if (!m) throw new RangeError(`Некорректная дата: ${d}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function parseTime(t: string): { hours: number; minutes: number } {
  const m = TIME_RE.exec(t);
  if (!m) throw new RangeError(`Некорректное время: ${t}`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

/** Поле Prisma `@db.Date` приходит как полночь UTC — берём его UTC-компоненты. */
export function fromDbDate(d: Date): LocalDate {
  return d.toISOString().slice(0, 10);
}

/** Обратное преобразование для записи в поле `@db.Date`. */
export function toDbDate(d: LocalDate): Date {
  const { year, month, day } = parseLocalDate(d);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Календарная дата момента времени в поясе школы. */
export function localDateOf(instant: Date, tz: string = SCHOOL_TZ): LocalDate {
  const z = new TZDate(instant.getTime(), tz);
  return localDate(z.getFullYear(), z.getMonth() + 1, z.getDate());
}

/** Момент времени (UTC) для даты и времени «ЧЧ:ММ» в поясе школы. */
export function zonedInstant(date: LocalDate, time: string, tz: string = SCHOOL_TZ): Date {
  const { year, month, day } = parseLocalDate(date);
  const { hours, minutes } = parseTime(time);
  return new Date(new TZDate(year, month - 1, day, hours, minutes, tz).getTime());
}

/** День недели по ISO: 1 = пн … 7 = вс. От пояса не зависит — это свойство календарной даты. */
export function isoWeekday(d: LocalDate): number {
  const { year, month, day } = parseLocalDate(d);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstOfMonth(year: number, month: number): LocalDate {
  return localDate(year, month, 1);
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
