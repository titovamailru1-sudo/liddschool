import { NBSP, SCHOOL_TZ } from "./constants";
import { localDateOf, parseLocalDate, type LocalDate } from "./calendar";
import { TZDate } from "@date-fns/tz";

/** 1500 → «1 500 ₽» (неразрывные пробелы). Отрицательные — со знаком «−». */
export function formatRub(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${digits}${NBSP}₽`;
}

/** 1.5 → «1,5»; 36 → «36». */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100).replace(".", ",");
}

/** «2026-11-01» → «01.11.2026». */
export function formatLocalDate(d: LocalDate): string {
  const { year, month, day } = parseLocalDate(d);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

/** «2026-11-01» → «01.11». */
export function formatDayMonth(d: LocalDate): string {
  return formatLocalDate(d).slice(0, 5);
}

/** Момент времени → «ДД.ММ.ГГГГ» в поясе школы. */
export function formatDate(instant: Date, tz: string = SCHOOL_TZ): string {
  return formatLocalDate(localDateOf(instant, tz));
}

/** Момент времени → «ЧЧ:ММ» в поясе школы. */
export function formatTime(instant: Date, tz: string = SCHOOL_TZ): string {
  const z = new TZDate(instant.getTime(), tz);
  return `${String(z.getHours()).padStart(2, "0")}:${String(z.getMinutes()).padStart(2, "0")}`;
}

/** Выбор формы слова по числу: plural(5, ["занятие", "занятия", "занятий"]) → «занятий». */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
] as const;

const MONTHS_PREP = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
] as const;

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/** «ноября» — для «уроки ноября», «11 ноября». */
export function monthNameGen(month: number): string {
  return MONTHS_GEN[month - 1];
}

/** «ноябрь» — для «Абонемент на ноябрь». */
export function monthName(month: number): string {
  return MONTHS_NOM[month - 1];
}

/** «ноябре» — для «В ноябре». */
export function monthNamePrep(month: number): string {
  return MONTHS_PREP[month - 1];
}

export const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** ISO-день недели (1 = пн) → «пн». */
export function weekdayShort(isoWeekday: number): string {
  return WEEKDAYS_SHORT[isoWeekday - 1];
}
