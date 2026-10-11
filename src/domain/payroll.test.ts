import { describe, expect, it } from "vitest";
import {
  lessonAccrual,
  monthPayroll,
  type Accrual,
  type AccrualLesson,
  type RatePlanInput,
} from "./payroll";

const PLAN: RatePlanInput = {
  baseAmount: 700,
  groupPerStudent: 100,
  trialFixed: 500,
  payForUnexcused: false,
  bonusApply: "WHOLE_MONTH",
  tiers: [
    { thresholdHours: 45, bonusPercent: 15 }, // порядок ступеней не важен
    { thresholdHours: 30, bonusPercent: 10 },
  ],
};

const ind = (over: Partial<AccrualLesson> = {}): AccrualLesson => ({
  durationMin: 60,
  status: "DONE",
  isTrial: false,
  isGroup: false,
  attendance: ["PRESENT"],
  ...over,
});

const month = (hours: number, plan = PLAN): Accrual[] =>
  Array.from({ length: hours }, () => lessonAccrual(ind(), plan));

describe("lessonAccrual", () => {
  it("индивидуальный 60 мин → 700, 1 ч в объём", () => {
    expect(lessonAccrual(ind(), PLAN)).toMatchObject({ hours: 1, amount: 700, basis: "1 ч × 700 ₽" });
  });

  it("45 мин → 525", () => expect(lessonAccrual(ind({ durationMin: 45 }), PLAN).amount).toBe(525));

  it.each(["PLANNED", "CANCELLED", "MOVED"] as const)("урок в статусе %s не начисляется", (status) => {
    expect(lessonAccrual(ind({ status }), PLAN)).toMatchObject({ hours: 0, amount: 0 });
  });

  it("пробный урок → 500, в объём не входит", () => {
    expect(lessonAccrual(ind({ isTrial: true, durationMin: 90 }), PLAN)).toMatchObject({
      hours: 0,
      hourlyAmount: 0,
      extraAmount: 500,
      amount: 500,
    });
  });

  it("неуважительный пропуск при payForUnexcused = false → 0, часы не идут в объём", () => {
    expect(lessonAccrual(ind({ attendance: ["ABSENT_UNEXCUSED"] }), PLAN)).toMatchObject({ hours: 0, amount: 0 });
  });

  it("неуважительный пропуск при payForUnexcused = true → начисляется полностью", () => {
    const plan = { ...PLAN, payForUnexcused: true };
    expect(lessonAccrual(ind({ attendance: ["ABSENT_UNEXCUSED"] }), plan)).toMatchObject({ hours: 1, amount: 700 });
  });

  it("уважительный пропуск → 0", () => {
    expect(lessonAccrual(ind({ attendance: ["ABSENT_EXCUSED"] }), PLAN).amount).toBe(0);
  });

  it("группа: доплата только за присутствующих", () => {
    const a = lessonAccrual(
      ind({ isGroup: true, attendance: ["PRESENT", "PRESENT", "ABSENT_UNEXCUSED", "ABSENT_EXCUSED"] }),
      PLAN,
    );
    expect(a).toMatchObject({ hours: 1, hourlyAmount: 700, extraAmount: 200, amount: 900 });
  });

  it("группа, никто не пришёл → 0", () => {
    expect(lessonAccrual(ind({ isGroup: true, attendance: ["ABSENT_UNEXCUSED", "ABSENT_EXCUSED"] }), PLAN).amount).toBe(0);
  });
});

describe("monthPayroll", () => {
  it("ровно 30 ч — порог включается: +10%", () => {
    const p = monthPayroll(month(30), PLAN);
    expect(p.bonusPercent).toBe(10);
    expect(p.total).toBe(23100);
  });

  it("29,75 ч — надбавки нет", () => {
    const acc = [...month(29), lessonAccrual(ind({ durationMin: 45 }), PLAN)];
    const p = monthPayroll(acc, PLAN);
    expect(p.hours).toBe(29.75);
    expect(p.bonusAmount).toBe(0);
  });

  it("ровно 45 ч — +15%", () => expect(monthPayroll(month(45), PLAN).bonusPercent).toBe(15));

  it("ABOVE_THRESHOLD, 50 ч: 15 ч × 70 + 5 ч × 105 = 1 575 надбавки", () => {
    const plan = { ...PLAN, bonusApply: "ABOVE_THRESHOLD" as const };
    const p = monthPayroll(month(50, plan), plan);
    expect(p.baseAmount).toBe(35000);
    expect(p.bonusAmount).toBe(1575);
    expect(p.total).toBe(36575);
  });

  it("ABOVE_THRESHOLD ниже порога — 0", () => {
    const plan = { ...PLAN, bonusApply: "ABOVE_THRESHOLD" as const };
    expect(monthPayroll(month(29, plan), plan).bonusAmount).toBe(0);
  });

  it("надбавка не применяется к доплате за группу и к пробным", () => {
    const acc = [
      ...month(30),
      lessonAccrual(ind({ isGroup: true, attendance: ["PRESENT", "PRESENT", "PRESENT"] }), PLAN), // +1 ч, +300
      lessonAccrual(ind({ isTrial: true }), PLAN), // +500, 0 ч
    ];
    const p = monthPayroll(acc, PLAN);
    expect(p.hours).toBe(31);
    expect(p.hourlyAmount).toBe(21700);
    expect(p.extraAmount).toBe(800);
    expect(p.bonusAmount).toBe(2170);
    expect(p.total).toBe(21700 + 800 + 2170);
  });

  it("пробные уроки не помогают достичь порога", () => {
    const acc = [...month(29), ...Array.from({ length: 5 }, () => lessonAccrual(ind({ isTrial: true }), PLAN))];
    expect(monthPayroll(acc, PLAN).bonusPercent).toBe(0);
  });

  it("пустой месяц — 0", () => expect(monthPayroll([], PLAN).total).toBe(0));
});
