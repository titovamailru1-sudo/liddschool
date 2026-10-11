/**
 * Контрольные примеры из CLAUDE.md — обязаны проходить всегда.
 * Ноябрь 2026 начинается в воскресенье.
 */
import { describe, expect, it } from "vitest";
import { calcMonthlyInvoice } from "./monthlyInvoice";
import { lessonAccrual, monthPayroll, type Accrual, type RatePlanInput } from "./payroll";
import { lessonHours, lessonPrice } from "./pricing";
import { occurrencesInMonth, type SeriesInput } from "./schedule";

const series = (weekday: number, durationMin = 60, id = `s${weekday}`): SeriesInput => ({
  id,
  weekday,
  startTime: "16:00",
  durationMin,
  startsOn: "2026-09-01",
  endsOn: null,
});

const invoiceFor = (list: SeriesInput[], monthlyRate: number, perLessonRate: number, balance = 0) =>
  calcMonthlyInvoice({
    year: 2026,
    month: 11,
    lessons: occurrencesInMonth(list, 2026, 11),
    monthlyRate,
    perLessonRate,
    balance,
  });

const PLAN: RatePlanInput = {
  baseAmount: 700,
  groupPerStudent: 100,
  trialFixed: 500,
  payForUnexcused: false,
  bonusApply: "WHOLE_MONTH",
  tiers: [
    { thresholdHours: 30, bonusPercent: 10 },
    { thresholdHours: 45, bonusPercent: 15 },
  ],
};

/** Месяц из N часовых индивидуальных уроков. */
const hoursOfLessons = (n: number): Accrual[] =>
  Array.from({ length: n }, () =>
    lessonAccrual(
      { durationMin: 60, status: "DONE", isTrial: false, isGroup: false, attendance: ["PRESENT"] },
      PLAN,
    ),
  );

describe("Контрольные примеры CLAUDE.md", () => {
  it("ЕГЭ, абонемент, вс 60 мин, ноябрь 2026 → 5 × 1 500 = 7 500; поурочно 8 500; выгода 1 000", () => {
    const inv = invoiceFor([series(7)], 1500, 1700);
    expect(inv.lessonsCount).toBe(5);
    expect(inv.amount).toBe(7500);
    expect(inv.perLessonAmount).toBe(8500);
    expect(inv.savings).toBe(1000);
    expect(inv.total).toBe(7500);
  });

  it("ОГЭ, абонемент, вт + пт 60 мин, ноябрь 2026 → 8 уроков, 12 000", () => {
    const inv = invoiceFor([series(2), series(5)], 1500, 1700);
    expect(inv.lessonsCount).toBe(8);
    expect(inv.amount).toBe(12000);
  });

  it("Школьная, абонемент, пн + ср 60 мин, ноябрь 2026 → 9 × 1 300 = 11 700; поурочно 13 500", () => {
    const inv = invoiceFor([series(1), series(3)], 1300, 1500);
    expect(inv.lessonsCount).toBe(9);
    expect(inv.amount).toBe(11700);
    expect(inv.perLessonAmount).toBe(13500);
  });

  it("То же + долг 1 700 → итого 13 400", () => {
    const inv = invoiceFor([series(1), series(3)], 1300, 1500, -1700);
    expect(inv.debtIncluded).toBe(1700);
    expect(inv.total).toBe(13400);
  });

  it("ЕГЭ поурочно, урок 90 мин → 1,5 × 1 700 = 2 550", () => {
    expect(lessonPrice(lessonHours(90), 1700)).toBe(2550);
  });

  it("Педагог, 36 ч, WHOLE_MONTH → 27 720", () => {
    const p = monthPayroll(hoursOfLessons(36), PLAN);
    expect(p.baseAmount).toBe(25200);
    expect(p.bonusPercent).toBe(10);
    expect(p.total).toBe(27720);
  });

  it("Педагог, 36 ч, ABOVE_THRESHOLD → 25 620", () => {
    const plan = { ...PLAN, bonusApply: "ABOVE_THRESHOLD" as const };
    expect(monthPayroll(hoursOfLessons(36), plan).total).toBe(25620);
  });

  it("Педагог, 48 ч → 33 600 + 15% = 38 640", () => {
    const p = monthPayroll(hoursOfLessons(48), PLAN);
    expect(p.baseAmount).toBe(33600);
    expect(p.bonusPercent).toBe(15);
    expect(p.total).toBe(38640);
  });

  it("Педагог, 22 ч → 15 400, надбавки нет", () => {
    const p = monthPayroll(hoursOfLessons(22), PLAN);
    expect(p.bonusAmount).toBe(0);
    expect(p.total).toBe(15400);
  });

  it("Групповой урок 90 мин, 5 присутствуют → 1,5 × 700 + 5 × 100 = 1 550", () => {
    const a = lessonAccrual(
      {
        durationMin: 90,
        status: "DONE",
        isTrial: false,
        isGroup: true,
        attendance: ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT_EXCUSED"],
      },
      PLAN,
    );
    expect(a.amount).toBe(1550);
    expect(a.basis).toBe("1,5 ч × 700 ₽ + 5 × 100 ₽");
  });
});
