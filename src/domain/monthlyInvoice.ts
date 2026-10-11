import { SCHOOL_TZ } from "./constants";
import { firstOfMonth, isoWeekday, localDateOf, type LocalDate } from "./calendar";
import {
  formatDayMonth,
  formatHours,
  formatRub,
  formatTime,
  monthName,
  monthNamePrep,
  plural,
  weekdayShort,
} from "./format";
import { subjectsDative } from "./names";
import { lessonHours, lessonPrice } from "./pricing";

export interface InvoiceLesson {
  startsAt: Date; // UTC
  durationMin: number;
}

export interface MonthlyInvoiceInput {
  year: number;
  month: number; // 1–12, месяц, на который выставляется счёт
  lessons: readonly InvoiceLesson[];
  monthlyRate: number; // ₽ за урок-час по абонементу
  perLessonRate: number; // ₽ за урок-час поурочно — для сравнения
  /** Текущий баланс клиента: < 0 — долг, > 0 — переплата (в т.ч. перенос стоимости с прошлого месяца). */
  balance: number;
}

export interface MonthlyInvoiceCalc {
  lessonsCount: number;
  hours: number;
  amount: number; // по абонементу
  perLessonAmount: number; // сколько вышло бы поурочно
  savings: number; // perLessonAmount − amount
  debtIncluded: number; // долг, добавленный к счёту
  creditApplied: number; // переплата, вычтенная из счёта
  total: number; // к оплате, не меньше 0
  dueDate: LocalDate; // 1-е число месяца счёта
}

/**
 * Счёт абонемента на месяц: Σ(часы урока × тариф), сравнение с поурочной оплатой,
 * плюс долг или минус переплата. Стоимость каждого урока округляется до рубля отдельно,
 * как в строках счёта (InvoiceItem).
 */
export function calcMonthlyInvoice(input: MonthlyInvoiceInput): MonthlyInvoiceCalc {
  let hours = 0;
  let amount = 0;
  let perLessonAmount = 0;
  for (const l of input.lessons) {
    const h = lessonHours(l.durationMin);
    hours += h;
    amount += lessonPrice(h, input.monthlyRate);
    perLessonAmount += lessonPrice(h, input.perLessonRate);
  }
  const debtIncluded = input.balance < 0 ? -input.balance : 0;
  const creditApplied = input.balance > 0 ? Math.min(input.balance, amount) : 0;
  return {
    lessonsCount: input.lessons.length,
    hours,
    amount,
    perLessonAmount,
    savings: perLessonAmount - amount,
    debtIncluded,
    creditApplied,
    total: amount + debtIncluded - creditApplied,
    dueDate: firstOfMonth(input.year, input.month),
  };
}

/**
 * Даты уроков, сгруппированные по дню недели и времени:
 * «вт 03.11, 10.11, 17.11, 24.11 в 16:00; пт 06.11, 13.11, 20.11, 27.11 в 17:30».
 */
export function describeLessonDates(lessons: readonly InvoiceLesson[], tz: string = SCHOOL_TZ): string {
  const groups = new Map<string, { weekday: number; time: string; dates: LocalDate[] }>();
  const sorted = [...lessons].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const l of sorted) {
    const d = localDateOf(l.startsAt, tz);
    const weekday = isoWeekday(d);
    const time = formatTime(l.startsAt, tz);
    const key = `${weekday}|${time}`;
    const g = groups.get(key) ?? { weekday, time, dates: [] };
    g.dates.push(d);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
    .map((g) => `${weekdayShort(g.weekday)} ${g.dates.map(formatDayMonth).join(", ")} в ${g.time}`)
    .join("; ");
}

export interface InvoiceMessageInput {
  parentName: string; // как обращаться: «Ольга Петровна»
  studentNameGen: string; // родительный падеж: «Миши Иванова»
  subjects: readonly string[]; // «математика», «информатика»
  year: number;
  month: number;
  lessons: readonly InvoiceLesson[];
  monthlyRate: number;
  perLessonRate: number;
  calc: MonthlyInvoiceCalc;
  payUrl: string;
  tz?: string;
}

const LESSON_FORMS = ["занятие", "занятия", "занятий"] as const;

/** Текст сообщения родителю по шаблону из CLAUDE.md. */
export function renderInvoiceMessage(m: InvoiceMessageInput): string {
  const { calc } = m;
  const n = calc.lessonsCount;
  // Если все уроки по 60 мин — «5 × 1 500 ₽», иначе считаем в урок-часах — «7,5 ч × 1 500 ₽».
  const qty = calc.hours === n ? String(n) : `${formatHours(calc.hours)} ч`;
  const mm = String(m.month).padStart(2, "0");

  const lines = [
    `Здравствуйте, ${m.parentName}! В ${monthNamePrep(m.month)} у ${m.studentNameGen} ${n} ${plural(n, LESSON_FORMS)} ` +
      `по ${subjectsDative(m.subjects)}: ${describeLessonDates(m.lessons, m.tz)}.`,
    `Абонемент на ${monthName(m.month)}: ${qty} × ${formatRub(m.monthlyRate)} = ${formatRub(calc.amount)}.`,
  ];
  if (calc.savings > 0) {
    lines.push(
      `При поурочной оплате вышло бы ${qty} × ${formatRub(m.perLessonRate)} = ${formatRub(calc.perLessonAmount)}, ` +
        `абонемент выгоднее на ${formatRub(calc.savings)}.`,
    );
  }
  const extra: string[] = [];
  if (calc.debtIncluded > 0) extra.push(`Также есть задолженность ${formatRub(calc.debtIncluded)}.`);
  if (calc.creditApplied > 0) extra.push(`Учтена переплата ${formatRub(calc.creditApplied)}.`);
  extra.push(`Итого к оплате: ${formatRub(calc.total)} до 01.${mm}.`);
  lines.push(extra.join(" "));
  lines.push(`Оплатить: ${m.payUrl}. Lidd School`);
  return lines.join("\n");
}
