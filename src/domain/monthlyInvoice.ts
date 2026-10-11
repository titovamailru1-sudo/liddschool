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
  /** Тарифы урока, если отличаются от общих (например, групповое занятие в счёте индивидуального ученика). */
  monthlyRate?: number;
  perLessonRate?: number;
}

export interface MonthlyInvoiceInput {
  year: number;
  month: number; // 1–12, месяц, на который выставляется счёт
  lessons: readonly InvoiceLesson[];
  monthlyRate: number; // ₽ за урок-час по абонементу (по умолчанию для уроков)
  perLessonRate: number; // ₽ за урок-час поурочно — для сравнения
  /** Текущий баланс клиента: < 0 — долг, > 0 — переплата. */
  balance: number;
  /** Перенос разницы прошлых месяцев: вычеты «−», доплаты «+». */
  adjustments?: number;
}

export interface InvoiceLine {
  hours: number;
  amount: number; // по абонементу
  perLessonAmount: number;
  monthlyRate: number;
  perLessonRate: number;
}

export interface MonthlyInvoiceCalc {
  lessonsCount: number;
  hours: number;
  amount: number; // по абонементу за уроки месяца
  perLessonAmount: number; // сколько вышло бы поурочно
  savings: number; // perLessonAmount − amount
  adjustmentsTotal: number; // перенос разницы прошлых месяцев
  debtIncluded: number; // долг, добавленный к счёту
  creditApplied: number; // переплата, вычтенная из счёта
  total: number; // к оплате, не меньше 0
  dueDate: LocalDate; // 1-е число месяца счёта
  lines: InvoiceLine[]; // по уроку на строку, в порядке lessons
}

/**
 * Счёт абонемента на месяц: Σ(часы урока × тариф), сравнение с поурочной оплатой,
 * перенос разницы прошлых месяцев, плюс долг или минус переплата.
 * Стоимость каждого урока округляется до рубля отдельно, как в строках счёта (InvoiceItem).
 */
export function calcMonthlyInvoice(input: MonthlyInvoiceInput): MonthlyInvoiceCalc {
  const lines: InvoiceLine[] = input.lessons.map((l) => {
    const h = lessonHours(l.durationMin);
    const monthlyRate = l.monthlyRate ?? input.monthlyRate;
    const perLessonRate = l.perLessonRate ?? input.perLessonRate;
    return {
      hours: h,
      amount: lessonPrice(h, monthlyRate),
      perLessonAmount: lessonPrice(h, perLessonRate),
      monthlyRate,
      perLessonRate,
    };
  });
  const hours = lines.reduce((s, l) => s + l.hours, 0);
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  const perLessonAmount = lines.reduce((s, l) => s + l.perLessonAmount, 0);
  const adjustmentsTotal = input.adjustments ?? 0;
  const due = amount + adjustmentsTotal;
  const debtIncluded = input.balance < 0 ? -input.balance : 0;
  const creditApplied = input.balance > 0 ? Math.max(0, Math.min(input.balance, due)) : 0;
  return {
    lessonsCount: input.lessons.length,
    hours,
    amount,
    perLessonAmount,
    savings: perLessonAmount - amount,
    adjustmentsTotal,
    debtIncluded,
    creditApplied,
    total: Math.max(0, due + debtIncluded - creditApplied),
    dueDate: firstOfMonth(input.year, input.month),
    lines,
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

/**
 * Расчёт по тарифам: «5 × 1 500 ₽» (все уроки по часу), «7,5 ч × 1 500 ₽» (разная длительность),
 * «8 × 1 500 ₽ + 6 ч × 800 ₽» (разные тарифы, например, индивидуальные и групповые).
 */
export function rateBreakdown(lines: readonly InvoiceLine[], rate: "monthlyRate" | "perLessonRate"): string {
  const byRate = new Map<number, { count: number; hours: number }>();
  for (const l of lines) {
    const g = byRate.get(l[rate]) ?? { count: 0, hours: 0 };
    g.count += 1;
    g.hours += l.hours;
    byRate.set(l[rate], g);
  }
  return [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([r, g]) => `${g.hours === g.count ? g.count : `${formatHours(g.hours)} ч`} × ${formatRub(r)}`)
    .join(" + ");
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
  /** Пояснения к переносу разницы: «урок 14.10 отменён школой». */
  adjustmentNotes?: readonly { amount: number; reason: string }[];
  tz?: string;
}

const LESSON_FORMS = ["занятие", "занятия", "занятий"] as const;

function signedRub(n: number) {
  return n > 0 ? `+${formatRub(n)}` : formatRub(n);
}

/** Текст сообщения родителю по шаблону из CLAUDE.md. */
export function renderInvoiceMessage(m: InvoiceMessageInput): string {
  const { calc } = m;
  const n = calc.lessonsCount;
  const mm = String(m.month).padStart(2, "0");

  const lines = [
    `Здравствуйте, ${m.parentName}! В ${monthNamePrep(m.month)} у ${m.studentNameGen} ${n} ${plural(n, LESSON_FORMS)} ` +
      `по ${subjectsDative(m.subjects)}: ${describeLessonDates(m.lessons, m.tz)}.`,
    `Абонемент на ${monthName(m.month)}: ${rateBreakdown(calc.lines, "monthlyRate")} = ${formatRub(calc.amount)}.`,
  ];
  if (calc.savings > 0) {
    lines.push(
      `При поурочной оплате вышло бы ${rateBreakdown(calc.lines, "perLessonRate")} = ${formatRub(calc.perLessonAmount)}, ` +
        `абонемент выгоднее на ${formatRub(calc.savings)}.`,
    );
  }
  if (calc.adjustmentsTotal !== 0 || m.adjustmentNotes?.length) {
    const notes = m.adjustmentNotes?.length ? ` (${m.adjustmentNotes.map((a) => a.reason).join("; ")})` : "";
    lines.push(`Перерасчёт за прошлый месяц: ${signedRub(calc.adjustmentsTotal)}${notes}.`);
  }
  const extra: string[] = [];
  if (calc.debtIncluded > 0) extra.push(`Также есть задолженность ${formatRub(calc.debtIncluded)}.`);
  if (calc.creditApplied > 0) extra.push(`Учтена переплата ${formatRub(calc.creditApplied)}.`);
  extra.push(`Итого к оплате: ${formatRub(calc.total)} до 01.${mm}.`);
  lines.push(extra.join(" "));
  lines.push(`Оплатить: ${m.payUrl}. Lidd School`);
  return lines.join("\n");
}
