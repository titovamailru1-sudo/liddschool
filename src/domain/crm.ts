import { addDays, firstOfMonth, lastOfMonth, nextMonth, parseLocalDate, startOfWeek, type LocalDate } from "./calendar";
import { formatRub, monthNamePrep, plural, weekdayShort } from "./format";
import { calcMonthlyInvoice, rateBreakdown } from "./monthlyInvoice";
import { occurrencesInMonth } from "./schedule";

// ───────────────────────── Задачи ─────────────────────────

export type TaskDisplayStatus = "new" | "inProgress" | "overdue" | "done";

/** Просрочена — срок прошёл, а задача не выполнена. */
export function taskDisplayStatus(status: "NEW" | "IN_PROGRESS" | "DONE", dueAt: Date | null, now: Date): TaskDisplayStatus {
  if (status === "DONE") return "done";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  return status === "IN_PROGRESS" ? "inProgress" : "new";
}

// ───────────────────────── Лиды ─────────────────────────

export const LEAD_STAGES = ["NEW", "CONTACTED", "TRIAL_SCHEDULED", "TRIAL_DONE", "WON", "LOST"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "Новая заявка",
  CONTACTED: "Связались",
  TRIAL_SCHEDULED: "Пробный назначен",
  TRIAL_DONE: "Пробный проведён",
  WON: "Оплатил",
  LOST: "Отказ",
};

export const LEAD_SOURCE_LABEL = {
  SITE: "Сайт",
  AVITO: "Авито",
  VK: "ВКонтакте",
  REFERRAL: "Сарафанное радио",
  OTHER: "Другое",
} as const;
export type LeadSource = keyof typeof LEAD_SOURCE_LABEL;

export const LOST_REASONS = ["Дорого", "Не подошло время", "Выбрали другую школу", "Не отвечает", "Другое"] as const;

export interface ConversionRow {
  source: LeadSource;
  total: number;
  won: number;
  lost: number;
  inProgress: number;
  conversion: number; // доля оплативших от всех заявок, %
}

/** Конверсия заявок в оплату по источникам (за выбранный период создания заявок). */
export function leadConversion(leads: readonly { source: LeadSource; stage: LeadStage }[]): { rows: ConversionRow[]; total: ConversionRow } {
  const by = new Map<LeadSource, ConversionRow>();
  const row = (source: LeadSource): ConversionRow => by.get(source) ?? { source, total: 0, won: 0, lost: 0, inProgress: 0, conversion: 0 };
  for (const l of leads) {
    const r = row(l.source);
    r.total++;
    if (l.stage === "WON") r.won++;
    else if (l.stage === "LOST") r.lost++;
    else r.inProgress++;
    by.set(l.source, r);
  }
  const pct = (won: number, total: number) => (total ? Math.round((won / total) * 1000) / 10 : 0);
  const rows = [...by.values()].map((r) => ({ ...r, conversion: pct(r.won, r.total) })).sort((a, b) => b.total - a.total);
  const sum = rows.reduce(
    (s, r) => ({ ...s, total: s.total + r.total, won: s.won + r.won, lost: s.lost + r.lost, inProgress: s.inProgress + r.inProgress }),
    { source: "OTHER" as LeadSource, total: 0, won: 0, lost: 0, inProgress: 0, conversion: 0 },
  );
  return { rows, total: { ...sum, conversion: pct(sum.won, sum.total) } };
}

/** Лиду нужно касание: больше 2 суток без контакта и заявка ещё в работе. */
export function leadNeedsTouch(stage: LeadStage, lastTouchAt: Date | null, createdAt: Date, now: Date, days = 2): boolean {
  if (stage === "WON" || stage === "LOST") return false;
  const last = lastTouchAt ?? createdAt;
  return now.getTime() - last.getTime() > days * 86_400_000;
}

// ───────────────────────── Расчёт предложения ─────────────────────────

export interface OfferInput {
  slots: readonly { weekday: number; durationMin: number }[]; // занятия в неделю
  year: number;
  month: number; // месяц, на который считаем
  monthlyRate: number;
  perLessonRate: number;
}

/** Сколько стоит месяц занятий по выбранному расписанию: абонемент и поурочно. */
export function calcOffer(o: OfferInput) {
  const series = o.slots.map((s, i) => ({
    id: `s${i}`,
    weekday: s.weekday,
    startTime: "12:00",
    durationMin: s.durationMin,
    startsOn: firstOfMonth(o.year, o.month),
    endsOn: null,
  }));
  const lessons = occurrencesInMonth(series, o.year, o.month);
  return calcMonthlyInvoice({ year: o.year, month: o.month, lessons, monthlyRate: o.monthlyRate, perLessonRate: o.perLessonRate, balance: 0 });
}

/** Текст предложения родителю после пробного урока. */
export function renderOfferMessage(m: {
  parentName: string | null;
  childName: string;
  subject: string;
  slots: readonly { weekday: number; durationMin: number }[];
  month: number;
  offer: ReturnType<typeof calcOffer>;
  perLessonRate: number;
}): string {
  const days = m.slots.map((s) => `${weekdayShort(s.weekday)} ${s.durationMin} мин`).join(", ");
  const n = m.offer.lessonsCount;
  const lines = [
    `Здравствуйте${m.parentName ? `, ${m.parentName}` : ""}! Спасибо, что пришли на пробное занятие.`,
    `Предлагаем занятия по ${m.subject} для ${m.childName}: ${days}. В ${monthNamePrep(m.month)} — ${n} ${plural(n, ["занятие", "занятия", "занятий"])}.`,
    `Абонемент на месяц: ${rateBreakdown(m.offer.lines, "monthlyRate")} = ${formatRub(m.offer.amount)}.`,
    `Поурочно: ${formatRub(m.perLessonRate)} за урок-час, за месяц вышло бы ${formatRub(m.offer.perLessonAmount)}` +
      (m.offer.savings > 0 ? ` — абонемент выгоднее на ${formatRub(m.offer.savings)}.` : "."),
    "Lidd School",
  ];
  return lines.join("\n");
}

// ───────────────────────── Периоды отчётов ─────────────────────────

export type PeriodKind = "week" | "month" | "quarter" | "custom";

export interface Period {
  from: LocalDate;
  to: LocalDate; // включительно
}

/** Период отчёта по дате: неделя (пн–вс), месяц, квартал. */
export function periodOf(kind: Exclude<PeriodKind, "custom">, d: LocalDate): Period {
  const { year, month } = parseLocalDate(d);
  if (kind === "week") {
    const from = startOfWeek(d);
    return { from, to: addDays(from, 6) };
  }
  if (kind === "month") return { from: firstOfMonth(year, month), to: lastOfMonth(year, month) };
  const q = Math.floor((month - 1) / 3) * 3 + 1;
  return { from: firstOfMonth(year, q), to: lastOfMonth(year, q + 2) };
}

/** Предыдущий такой же период: прошлая неделя / месяц / квартал; для произвольного — столько же дней до начала. */
export function previousPeriod(kind: PeriodKind, p: Period): Period {
  if (kind === "custom") {
    const days = Math.round((Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / 86_400_000) + 1;
    return { from: addDays(p.from, -days), to: addDays(p.from, -1) };
  }
  return periodOf(kind, addDays(p.from, -1));
}

/** Месяцы, которые целиком входят в период (для надбавки педагогов, она считается за месяц). */
export function wholeMonths(p: Period): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  let { year, month } = parseLocalDate(p.from);
  for (;;) {
    const first = firstOfMonth(year, month);
    const last = lastOfMonth(year, month);
    if (first > p.to) break;
    if (first >= p.from && last <= p.to) result.push({ year, month });
    ({ year, month } = nextMonth(year, month));
  }
  return result;
}

/** Изменение к прошлому периоду, %: null — если сравнивать не с чем. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
