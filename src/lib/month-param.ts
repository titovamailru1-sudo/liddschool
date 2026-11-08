import { addDays, firstOfMonth, lastOfMonth, parseLocalDate, type LocalDate } from "@/domain/calendar";

/** Месяц из параметра адреса «2026-11» (по умолчанию — текущий) и соседние месяцы для стрелок. */
export function monthParam(v: string | undefined, today: LocalDate) {
  const { year, month } = parseLocalDate(today);
  let y = year;
  let m = month;
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [yy, mm] = v.split("-").map(Number);
    if (mm >= 1 && mm <= 12) [y, m] = [yy, mm];
  }
  const start = firstOfMonth(y, m);
  return { year: y, month: m, key: start.slice(0, 7), prev: addDays(start, -1).slice(0, 7), next: addDays(lastOfMonth(y, m), 1).slice(0, 7) };
}
