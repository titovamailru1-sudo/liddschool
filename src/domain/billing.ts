import type { AttendanceStatus, CancelledByKind, LessonStatus } from "./constants";
import { localDateOf, nextMonth, parseLocalDate } from "./calendar";
import { formatDayMonth, formatLocalDate, formatRub, formatTime } from "./format";
import { subjectDative } from "./names";

// ───────────────────────── Перенос разницы между месяцами ─────────────────────────

export interface LessonNode {
  id: string;
  startsAt: Date;
  status: LessonStatus;
  cancelledBy: CancelledByKind | null;
  movedToId: string | null;
  /** Посещаемость этого ученика (для групповых уроков — его отметка). */
  attendance: AttendanceStatus | null;
}

/** Урок, в который в итоге превратился исходный после цепочки переносов. */
export function finalLesson(id: string, byId: ReadonlyMap<string, LessonNode>): LessonNode | undefined {
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && cur.status === "MOVED" && cur.movedToId && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.movedToId);
  }
  return cur;
}

export interface CreditRules {
  creditOnSchoolCancel: boolean;
  creditOnExcused: boolean;
}

/**
 * Что стало с оплаченным в счёте уроком (после всех переносов):
 * - consumed — состоялся, запланирован (в т.ч. перенесён на другой день) или неуважительный пропуск;
 * - credit — отменён школой без новой даты или уважительный пропуск: стоимость вычитается из следующего счёта;
 * - pending — ещё неизвестно (цепочка переноса не загружена) — пока не трогаем.
 */
export function invoicedLessonOutcome(
  final: LessonNode | undefined,
  rules: CreditRules,
): { kind: "consumed" } | { kind: "credit"; reason: string } | { kind: "pending" } {
  if (!final) return { kind: "pending" };
  const when = formatDayMonth(localDateOf(final.startsAt));
  if (final.status === "CANCELLED") {
    if (final.cancelledBy === "SCHOOL") {
      return rules.creditOnSchoolCancel ? { kind: "credit", reason: `урок ${when} отменён школой` } : { kind: "consumed" };
    }
    return rules.creditOnExcused ? { kind: "credit", reason: `уважительный пропуск ${when}` } : { kind: "consumed" };
  }
  if (final.status === "DONE" && final.attendance === "ABSENT_EXCUSED") {
    return rules.creditOnExcused ? { kind: "credit", reason: `уважительный пропуск ${when}` } : { kind: "consumed" };
  }
  if (final.status === "MOVED") return { kind: "pending" };
  return { kind: "consumed" };
}

/** Урок, не вошедший в счёт своего месяца (добавлен позже), нужно доплатить, если он не отменён и не уважительный пропуск. */
export function isBillableExtra(l: LessonNode): boolean {
  if (l.status === "CANCELLED" || l.status === "MOVED") return false;
  if (l.attendance === "ABSENT_EXCUSED") return false;
  return true;
}

// ───────────────────────── Когда формировать счета ─────────────────────────

/** С invoiceDay (25-го) формируются черновики на следующий месяц. */
export function invoiceTarget(today: string, invoiceDay: number): { year: number; month: number } | null {
  const { year, month, day } = parseLocalDate(today);
  return day >= invoiceDay ? nextMonth(year, month) : null;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ───────────────────────── Поурочная оплата ─────────────────────────

export interface UpcomingCharge {
  id: string; // ключ: урок + ученик
  startsAt: Date;
  price: number;
}

/**
 * Какие предстоящие уроки покрыты балансом (предоплатой). Баланс расходуется на уроки по порядку;
 * урок, на который не хватило, не покрыт, и деньги на него не резервируются.
 */
export function coverage(balance: number, upcoming: readonly UpcomingCharge[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  let left = balance;
  for (const u of [...upcoming].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (left >= u.price) {
      result.set(u.id, true);
      left -= u.price;
    } else {
      result.set(u.id, false);
    }
  }
  return result;
}

export interface PerLessonState {
  startsAt: Date;
  covered: boolean;
  linkSentAt: Date | null;
  atRiskAt: Date | null;
}

/**
 * Что сделать по уроку поурочника сейчас:
 * - за linkHours (48 ч) до урока и не оплачен — отправить ссылку;
 * - за deadlineHours (24 ч) и не оплачен — пометить «под угрозой» и поставить задачу администратору;
 * - оплачен после пометки — снять пометку.
 */
export function perLessonActions(
  now: Date,
  s: PerLessonState,
  linkHours = 48,
  deadlineHours = 24,
): { sendLink: boolean; markAtRisk: boolean; clearAtRisk: boolean } {
  const hoursLeft = (s.startsAt.getTime() - now.getTime()) / 3_600_000;
  const upcoming = hoursLeft > 0;
  return {
    sendLink: upcoming && !s.covered && !s.linkSentAt && hoursLeft <= linkHours,
    markAtRisk: upcoming && !s.covered && !s.atRiskAt && hoursLeft <= deadlineHours,
    clearAtRisk: s.covered && !!s.atRiskAt,
  };
}

/** Сообщение родителю поурочника со ссылкой на оплату урока. */
export function renderLessonPaymentMessage(m: {
  parentName: string;
  studentNameGen: string;
  subject: string;
  startsAt: Date;
  durationMin: number;
  amount: number;
  deadline: Date;
  payUrl: string;
}): string {
  return [
    `Здравствуйте, ${m.parentName}! ${formatLocalDate(localDateOf(m.startsAt))} в ${formatTime(m.startsAt)} ` +
      `у ${m.studentNameGen} занятие по ${subjectDative(m.subject)} (${m.durationMin} мин).`,
    `К оплате: ${formatRub(m.amount)} до ${formatLocalDate(localDateOf(m.deadline))} ${formatTime(m.deadline)}.`,
    `Оплатить: ${m.payUrl}. Lidd School`,
  ].join("\n");
}

/** Напоминание о неоплаченном абонементе (3-го числа). */
export function renderInvoiceReminder(m: { parentName: string; studentNameGen: string; monthName: string; amount: number; payUrl: string }): string {
  return [
    `Здравствуйте, ${m.parentName}! Напоминаем об оплате абонемента ${m.studentNameGen} на ${m.monthName}: ${formatRub(m.amount)}.`,
    `Оплатить: ${m.payUrl}. Если уже оплатили — спасибо, просто не обращайте внимания. Lidd School`,
  ].join("\n");
}

// ───────────────────────── QR для перевода по реквизитам ─────────────────────────

export interface PayeeDetails {
  name: string; // получатель
  personalAcc: string; // расчётный счёт, 20 цифр
  bankName: string;
  bic: string; // 9 цифр
  correspAcc: string; // корр. счёт, 20 цифр
  payeeInn?: string;
}

/** Реквизиты заполнены полностью — можно показывать QR. */
export function payeeComplete(d: Partial<PayeeDetails> | null | undefined): d is PayeeDetails {
  return !!(d?.name && /^\d{20}$/.test(d.personalAcc ?? "") && d.bankName && /^\d{9}$/.test(d.bic ?? "") && /^\d{20}$/.test(d.correspAcc ?? ""));
}

/**
 * Строка платёжного QR по ГОСТ Р 56042-2014 (её понимают банковские приложения):
 * ST00012|Name=…|PersonalAcc=…|BankName=…|BIC=…|CorrespAcc=…|PayeeINN=…|Sum=<копейки>|Purpose=…
 */
export function paymentQrString(d: PayeeDetails, amountRub: number, purpose: string): string {
  const clean = (v: string) => v.replace(/[|\r\n]/g, " ").trim();
  const fields = [
    `Name=${clean(d.name)}`,
    `PersonalAcc=${d.personalAcc}`,
    `BankName=${clean(d.bankName)}`,
    `BIC=${d.bic}`,
    `CorrespAcc=${d.correspAcc}`,
    ...(d.payeeInn ? [`PayeeINN=${d.payeeInn}`] : []),
    `Sum=${Math.round(amountRub * 100)}`,
    `Purpose=${clean(purpose)}`,
  ];
  return ["ST00012", ...fields].join("|");
}
