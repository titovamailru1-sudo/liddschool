import type { AttendanceStatus, CancelledByKind, LessonStatus, PaymentMode } from "./constants";
import { lessonAccrual, type Accrual, type RatePlanInput } from "./payroll";
import { lessonHours, lessonPrice } from "./pricing";

/**
 * Итог урока, который выбирает педагог или администратор.
 * - PLANNED — снять отметку;
 * - DONE — урок состоялся; посещаемость по каждому ученику (для индивидуального — один ученик:
 *   PRESENT или ABSENT_UNEXCUSED);
 * - CANCELLED — отменён школой или клиентом. Отмена клиентом индивидуального урока заранее (≥ 24 ч) —
 *   это и есть «пропуск ув.».
 */
export type LessonOutcome =
  | { kind: "PLANNED" }
  | { kind: "DONE"; attendance: Readonly<Record<string, AttendanceStatus>> }
  | { kind: "CANCELLED"; by: CancelledByKind };

export interface SettlementStudent {
  clientId: string;
  paymentMode: PaymentMode;
  pricePerHour: number; // тариф на дату урока для этого ученика (индивидуальный или групповой)
}

export interface SettlementInput {
  durationMin: number;
  isTrial: boolean;
  isGroup: boolean;
  students: readonly SettlementStudent[];
  outcome: LessonOutcome;
  plan: RatePlanInput;
}

export interface SettledAttendance {
  clientId: string;
  status: AttendanceStatus;
  paymentMode: PaymentMode;
  price: number;
}

export interface LessonCharge {
  clientId: string;
  amount: number; // отрицательное — списание
}

export interface Settlement {
  status: LessonStatus;
  cancelledBy: CancelledByKind | null;
  attendances: SettledAttendance[];
  accrual: Accrual;
  charges: LessonCharge[];
}

/**
 * Последствия отметки урока: посещаемость со стоимостью, начисление педагогу и списания с баланса.
 * Списания (LESSON_CHARGE) — только поурочникам: за проведённый урок и за неуважительный пропуск.
 * Абонементщики платят по счёту месяца; переносы стоимости считаются при формировании счёта (этап 3).
 * Пробный урок клиенту не списывается.
 */
export function settleLesson(input: SettlementInput): Settlement {
  const hours = lessonHours(input.durationMin);
  const priceOf = (s: SettlementStudent) => lessonPrice(hours, s.pricePerHour);
  const { outcome } = input;

  if (outcome.kind === "PLANNED") {
    return { status: "PLANNED", cancelledBy: null, attendances: [], accrual: zeroAccrual(), charges: [] };
  }

  if (outcome.kind === "CANCELLED") {
    // Отмена клиентом индивидуального урока — фиксируем уважительный пропуск в посещаемости.
    const attendances: SettledAttendance[] =
      outcome.by === "CLIENT" && !input.isGroup
        ? input.students.map((s) => ({
            clientId: s.clientId,
            status: "ABSENT_EXCUSED" as const,
            paymentMode: s.paymentMode,
            price: priceOf(s),
          }))
        : [];
    return { status: "CANCELLED", cancelledBy: outcome.by, attendances, accrual: zeroAccrual(), charges: [] };
  }

  const attendances: SettledAttendance[] = input.students.map((s) => {
    const status = outcome.attendance[s.clientId];
    if (!status) throw new Error(`Не отмечена посещаемость ученика ${s.clientId}`);
    if (!input.isGroup && status === "ABSENT_EXCUSED") {
      throw new Error("Уважительный пропуск индивидуального урока оформляется как отмена клиентом");
    }
    return { clientId: s.clientId, status, paymentMode: s.paymentMode, price: priceOf(s) };
  });

  const accrual = lessonAccrual(
    {
      durationMin: input.durationMin,
      status: "DONE",
      isTrial: input.isTrial,
      isGroup: input.isGroup,
      attendance: attendances.map((a) => a.status),
    },
    input.plan,
  );

  const charges: LessonCharge[] = input.isTrial
    ? []
    : attendances
        .filter((a) => a.paymentMode === "PER_LESSON" && a.status !== "ABSENT_EXCUSED" && a.price > 0)
        .map((a) => ({ clientId: a.clientId, amount: -a.price }));

  return { status: "DONE", cancelledBy: null, attendances, accrual, charges };
}

function zeroAccrual(): Accrual {
  return { hours: 0, hourlyAmount: 0, extraAmount: 0, amount: 0, basis: "Урок не проведён" };
}

/** Действующее списание по уроку в журнале (не сторнированное и не само сторно). */
export interface ActiveCharge {
  id: string;
  clientId: string;
  amount: number;
}

/**
 * Сверка списаний при повторной отметке. Финансовые записи не удаляются:
 * лишние или изменившиеся сторнируются, недостающие создаются. Совпадающие остаются как есть.
 */
export function reconcileCharges(
  active: readonly ActiveCharge[],
  desired: readonly LessonCharge[],
): { reverse: ActiveCharge[]; create: LessonCharge[] } {
  const reverse: ActiveCharge[] = [];
  const create: LessonCharge[] = [];
  const clients = new Set([...active.map((a) => a.clientId), ...desired.map((d) => d.clientId)]);
  for (const clientId of clients) {
    const current = active.filter((a) => a.clientId === clientId);
    const want = desired.filter((d) => d.clientId === clientId);
    const currentSum = current.reduce((s, a) => s + a.amount, 0);
    const wantSum = want.reduce((s, d) => s + d.amount, 0);
    if (currentSum === wantSum && current.length === want.length) continue;
    reverse.push(...current);
    create.push(...want);
  }
  return { reverse, create };
}

/** Клиент предупредил об отмене: за 24 ч и раньше — уважительно, позже — неуважительный пропуск. */
export function classifyClientCancellation(
  lessonStartsAt: Date,
  notifiedAt: Date,
  minNoticeHours = 24,
): "EXCUSED" | "UNEXCUSED" {
  const hoursBefore = (lessonStartsAt.getTime() - notifiedAt.getTime()) / 3_600_000;
  return hoursBefore >= minNoticeHours ? "EXCUSED" : "UNEXCUSED";
}

/** Статус урока для отображения в интерфейсе (единые цвета статусов). */
export type LessonDisplayStatus = "planned" | "done" | "cancelled" | "excused" | "unexcused" | "moved";

export function lessonDisplayStatus(
  status: LessonStatus,
  cancelledBy: CancelledByKind | null,
  isGroup: boolean,
  attendance: readonly AttendanceStatus[],
): LessonDisplayStatus {
  switch (status) {
    case "PLANNED":
      return "planned";
    case "MOVED":
      return "moved";
    case "CANCELLED":
      return cancelledBy === "CLIENT" && !isGroup ? "excused" : "cancelled";
    case "DONE":
      return !isGroup && attendance[0] === "ABSENT_UNEXCUSED" ? "unexcused" : "done";
  }
}
