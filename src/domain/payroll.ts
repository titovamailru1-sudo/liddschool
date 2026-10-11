import type { AttendanceStatus, BonusApply, LessonStatus } from "./constants";
import { formatHours, formatRub } from "./format";
import { lessonHours } from "./pricing";

export interface RateTierInput {
  thresholdHours: number; // 30, 45
  bonusPercent: number; // 10, 15
}

export interface RatePlanInput {
  baseAmount: number; // ₽ за урок-час
  groupPerStudent: number; // ₽ за каждого присутствующего в группе
  trialFixed: number; // ₽ за пробный урок
  payForUnexcused: boolean;
  bonusApply: BonusApply;
  tiers: readonly RateTierInput[];
}

export interface AccrualLesson {
  durationMin: number;
  status: LessonStatus;
  isTrial: boolean;
  isGroup: boolean;
  attendance: readonly AttendanceStatus[];
}

export interface Accrual {
  hours: number; // урок-часы, входящие в объём для надбавки
  hourlyAmount: number; // часы × ставка — к этой части применяется надбавка
  extraAmount: number; // доплата за учеников группы или фикс за пробный — без надбавки
  amount: number; // hourlyAmount + extraAmount
  basis: string; // «1,5 ч × 700 ₽ + 5 × 100 ₽»
}

const ZERO = (basis: string): Accrual => ({ hours: 0, hourlyAmount: 0, extraAmount: 0, amount: 0, basis });

function hourly(hours: number, plan: RatePlanInput, extra = 0, extraBasis = ""): Accrual {
  const hourlyAmount = Math.round(hours * plan.baseAmount);
  const basis = `${formatHours(hours)} ч × ${formatRub(plan.baseAmount)}${extraBasis}`;
  return { hours, hourlyAmount, extraAmount: extra, amount: hourlyAmount + extra, basis };
}

/**
 * Начисление педагогу за один урок (без надбавки за объём).
 * - не проведён (запланирован, отменён, перенесён) → 0;
 * - пробный → фикс, в объём часов не входит;
 * - индивидуальный: присутствовал → часы × ставка; неуважительный пропуск → только при payForUnexcused;
 *   уважительный пропуск → 0;
 * - групповой: часы × ставка + доплата за каждого присутствующего; если не пришёл никто —
 *   как индивидуальный с неуважительным пропуском.
 * Часы идут в объём для надбавки только если за них начислено.
 */
export function lessonAccrual(lesson: AccrualLesson, plan: RatePlanInput): Accrual {
  if (lesson.status !== "DONE") return ZERO("Урок не проведён");
  if (lesson.isTrial) {
    return {
      hours: 0,
      hourlyAmount: 0,
      extraAmount: plan.trialFixed,
      amount: plan.trialFixed,
      basis: `Пробный урок: ${formatRub(plan.trialFixed)}`,
    };
  }

  const hours = lessonHours(lesson.durationMin);
  const present = lesson.attendance.filter((a) => a === "PRESENT").length;
  const unexcused = lesson.attendance.filter((a) => a === "ABSENT_UNEXCUSED").length;

  if (lesson.isGroup) {
    if (present > 0) {
      const extra = present * plan.groupPerStudent;
      return hourly(hours, plan, extra, ` + ${present} × ${formatRub(plan.groupPerStudent)}`);
    }
    if (unexcused > 0 && plan.payForUnexcused) return hourly(hours, plan);
    return ZERO("Никто не пришёл");
  }

  // Индивидуальный урок, отмеченный проведённым без записи посещаемости, считаем как присутствие.
  const status = lesson.attendance[0] ?? "PRESENT";
  if (status === "PRESENT") return hourly(hours, plan);
  if (status === "ABSENT_UNEXCUSED") {
    return plan.payForUnexcused ? hourly(hours, plan) : ZERO("Неуважительный пропуск — не начисляется");
  }
  return ZERO("Уважительный пропуск — не начисляется");
}

export interface MonthPayroll {
  hours: number;
  hourlyAmount: number;
  extraAmount: number;
  baseAmount: number; // hourlyAmount + extraAmount, без надбавки
  bonusPercent: number; // максимальная достигнутая ступень
  bonusAmount: number;
  total: number;
}

/**
 * Зарплата за календарный месяц. Ставка в месяце одна (меняется только с 1-го числа).
 * Надбавка — только к почасовой части:
 * - WHOLE_MONTH: процент максимальной достигнутой ступени ко всей почасовой сумме;
 * - ABOVE_THRESHOLD: прогрессивно, к часам внутри каждой ступени (30–45 ч → 10 %, сверх 45 → 15 %).
 * Порог включительный: ровно 30 ч — уже +10 %.
 */
export function monthPayroll(accruals: readonly Accrual[], plan: RatePlanInput): MonthPayroll {
  const hours = accruals.reduce((s, a) => s + a.hours, 0);
  const hourlyAmount = accruals.reduce((s, a) => s + a.hourlyAmount, 0);
  const extraAmount = accruals.reduce((s, a) => s + a.extraAmount, 0);
  const tiers = [...plan.tiers].sort((a, b) => a.thresholdHours - b.thresholdHours);

  const reached = tiers.filter((t) => hours >= t.thresholdHours);
  const bonusPercent = reached.length ? reached[reached.length - 1].bonusPercent : 0;

  let bonusAmount = 0;
  if (plan.bonusApply === "WHOLE_MONTH") {
    bonusAmount = Math.round((hourlyAmount * bonusPercent) / 100);
  } else {
    let raw = 0;
    tiers.forEach((t, i) => {
      const upper = i + 1 < tiers.length ? tiers[i + 1].thresholdHours : Infinity;
      const inTier = Math.max(0, Math.min(hours, upper) - t.thresholdHours);
      raw += (inTier * plan.baseAmount * t.bonusPercent) / 100;
    });
    bonusAmount = Math.round(raw);
  }

  const baseAmount = hourlyAmount + extraAmount;
  return {
    hours,
    hourlyAmount,
    extraAmount,
    baseAmount,
    bonusPercent,
    bonusAmount,
    total: baseAmount + bonusAmount,
  };
}

export interface TierProgress {
  hours: number;
  currentPercent: number;
  /** Следующая ступень надбавки и сколько часов до неё; null — достигнута максимальная. */
  next: { thresholdHours: number; bonusPercent: number; hoursLeft: number } | null;
}

/** Шкала часов: текущая надбавка и сколько осталось до следующей ступени («до +10% осталось 4 ч»). */
export function tierProgress(hours: number, tiers: readonly RateTierInput[]): TierProgress {
  const sorted = [...tiers].sort((a, b) => a.thresholdHours - b.thresholdHours);
  const reached = sorted.filter((t) => hours >= t.thresholdHours);
  const next = sorted.find((t) => hours < t.thresholdHours);
  return {
    hours,
    currentPercent: reached.length ? reached[reached.length - 1].bonusPercent : 0,
    next: next ? { thresholdHours: next.thresholdHours, bonusPercent: next.bonusPercent, hoursLeft: next.thresholdHours - hours } : null,
  };
}

export interface PayrollTotals {
  earned: number; // начислено за месяц с надбавкой
  adjustments: number; // премии, штрафы, перерасчёт прошлых месяцев
  total: number; // к начислению
  paid: number; // выплачено (авансы + выплаты)
  toPay: number; // осталось выплатить (может быть < 0, если переплатили)
}

/** Итог ведомости педагога: начислено + корректировки − выплачено. */
export function payrollTotals(earned: number, adjustments: readonly number[], payments: readonly number[]): PayrollTotals {
  const adj = adjustments.reduce((s, a) => s + a, 0);
  const paid = payments.reduce((s, p) => s + p, 0);
  return { earned, adjustments: adj, total: earned + adj, paid, toPay: earned + adj - paid };
}
