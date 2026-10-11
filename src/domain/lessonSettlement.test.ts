import { describe, expect, it } from "vitest";
import {
  classifyClientCancellation,
  lessonDisplayStatus,
  reconcileCharges,
  settleLesson,
  type SettlementInput,
} from "./lessonSettlement";
import type { RatePlanInput } from "./payroll";

const PLAN: RatePlanInput = {
  baseAmount: 700,
  groupPerStudent: 100,
  trialFixed: 500,
  payForUnexcused: false,
  bonusApply: "WHOLE_MONTH",
  tiers: [],
};

const individual = (over: Partial<SettlementInput> = {}): SettlementInput => ({
  durationMin: 90,
  isTrial: false,
  isGroup: false,
  students: [{ clientId: "c1", paymentMode: "PER_LESSON", pricePerHour: 1700 }],
  outcome: { kind: "DONE", attendance: { c1: "PRESENT" } },
  plan: PLAN,
  ...over,
});

describe("settleLesson — индивидуальный урок", () => {
  it("поурочник, проведён: 1,5 × 1 700 = 2 550 списано, педагогу 1 050", () => {
    const s = settleLesson(individual());
    expect(s.status).toBe("DONE");
    expect(s.attendances).toEqual([{ clientId: "c1", status: "PRESENT", paymentMode: "PER_LESSON", price: 2550 }]);
    expect(s.charges).toEqual([{ clientId: "c1", amount: -2550 }]);
    expect(s.accrual).toMatchObject({ hours: 1.5, amount: 1050 });
  });

  it("абонементщик, проведён: списаний нет (платит по счёту), педагогу начислено", () => {
    const s = settleLesson(
      individual({ students: [{ clientId: "c1", paymentMode: "MONTHLY", pricePerHour: 1500 }] }),
    );
    expect(s.charges).toEqual([]);
    expect(s.attendances[0].price).toBe(2250);
    expect(s.accrual.amount).toBe(1050);
  });

  it("неуважительный пропуск поурочника: списание полностью, педагогу 0 (payForUnexcused = false)", () => {
    const s = settleLesson(individual({ outcome: { kind: "DONE", attendance: { c1: "ABSENT_UNEXCUSED" } } }));
    expect(s.charges).toEqual([{ clientId: "c1", amount: -2550 }]);
    expect(s.accrual).toMatchObject({ hours: 0, amount: 0 });
  });

  it("неуважительный пропуск при payForUnexcused = true: педагогу начислено", () => {
    const s = settleLesson(
      individual({ plan: { ...PLAN, payForUnexcused: true }, outcome: { kind: "DONE", attendance: { c1: "ABSENT_UNEXCUSED" } } }),
    );
    expect(s.accrual.amount).toBe(1050);
  });

  it("отмена клиентом заранее = уважительный пропуск: без списаний и начислений", () => {
    const s = settleLesson(individual({ outcome: { kind: "CANCELLED", by: "CLIENT" } }));
    expect(s).toMatchObject({ status: "CANCELLED", cancelledBy: "CLIENT", charges: [] });
    expect(s.attendances[0].status).toBe("ABSENT_EXCUSED");
    expect(s.accrual.amount).toBe(0);
  });

  it("отмена школой: ни посещаемости, ни денег", () => {
    const s = settleLesson(individual({ outcome: { kind: "CANCELLED", by: "SCHOOL" } }));
    expect(s).toMatchObject({ status: "CANCELLED", cancelledBy: "SCHOOL", attendances: [], charges: [] });
  });

  it("снять отметку — всё обнуляется", () => {
    const s = settleLesson(individual({ outcome: { kind: "PLANNED" } }));
    expect(s).toMatchObject({ status: "PLANNED", attendances: [], charges: [] });
    expect(s.accrual.amount).toBe(0);
  });

  it("пробный урок: педагогу 500, клиенту не списывается", () => {
    const s = settleLesson(individual({ isTrial: true }));
    expect(s.charges).toEqual([]);
    expect(s.accrual.amount).toBe(500);
  });

  it("уважительный пропуск через отметку индивидуального урока — ошибка (это отмена клиентом)", () => {
    expect(() =>
      settleLesson(individual({ outcome: { kind: "DONE", attendance: { c1: "ABSENT_EXCUSED" } } })),
    ).toThrow(/отмена клиентом/);
  });

  it("не отмечен ученик — ошибка", () => {
    expect(() => settleLesson(individual({ outcome: { kind: "DONE", attendance: {} } }))).toThrow();
  });
});

describe("settleLesson — групповой урок", () => {
  const group = settleLesson({
    durationMin: 90,
    isTrial: false,
    isGroup: true,
    students: [
      { clientId: "a", paymentMode: "MONTHLY", pricePerHour: 800 },
      { clientId: "b", paymentMode: "PER_LESSON", pricePerHour: 1000 },
      { clientId: "c", paymentMode: "PER_LESSON", pricePerHour: 1000 },
      { clientId: "d", paymentMode: "PER_LESSON", pricePerHour: 1000 },
    ],
    outcome: { kind: "DONE", attendance: { a: "PRESENT", b: "PRESENT", c: "ABSENT_EXCUSED", d: "ABSENT_UNEXCUSED" } },
    plan: PLAN,
  });

  it("педагогу: 1,5 × 700 + 2 присутствующих × 100 = 1 250", () => {
    expect(group.accrual.amount).toBe(1250);
  });

  it("списания: поурочникам — присутствовал и неуважительный пропуск; уважительный — нет", () => {
    expect(group.charges).toEqual([
      { clientId: "b", amount: -1500 },
      { clientId: "d", amount: -1500 },
    ]);
  });

  it("групповая цена по групповому тарифу", () => {
    expect(group.attendances.find((a) => a.clientId === "a")?.price).toBe(1200);
  });

  it("отмена клиентом группового урока целиком — посещаемость не пишется", () => {
    const s = settleLesson({
      durationMin: 60,
      isTrial: false,
      isGroup: true,
      students: [{ clientId: "a", paymentMode: "MONTHLY", pricePerHour: 800 }],
      outcome: { kind: "CANCELLED", by: "CLIENT" },
      plan: PLAN,
    });
    expect(s.attendances).toEqual([]);
  });
});

describe("reconcileCharges", () => {
  it("та же отметка повторно — ничего не меняется", () => {
    const r = reconcileCharges([{ id: "e1", clientId: "c1", amount: -2550 }], [{ clientId: "c1", amount: -2550 }]);
    expect(r).toEqual({ reverse: [], create: [] });
  });

  it("проведён → отменён школой: списание сторнируется", () => {
    const r = reconcileCharges([{ id: "e1", clientId: "c1", amount: -2550 }], []);
    expect(r.reverse.map((x) => x.id)).toEqual(["e1"]);
    expect(r.create).toEqual([]);
  });

  it("изменилась сумма: сторно старого + новое списание", () => {
    const r = reconcileCharges([{ id: "e1", clientId: "c1", amount: -1700 }], [{ clientId: "c1", amount: -2550 }]);
    expect(r.reverse.map((x) => x.id)).toEqual(["e1"]);
    expect(r.create).toEqual([{ clientId: "c1", amount: -2550 }]);
  });

  it("в группе меняется только тот, у кого изменилась отметка", () => {
    const r = reconcileCharges(
      [
        { id: "e1", clientId: "b", amount: -1500 },
        { id: "e2", clientId: "d", amount: -1500 },
      ],
      [{ clientId: "b", amount: -1500 }],
    );
    expect(r.reverse.map((x) => x.id)).toEqual(["e2"]);
    expect(r.create).toEqual([]);
  });
});

describe("classifyClientCancellation", () => {
  const lesson = new Date("2026-11-02T06:00:00Z");
  it("ровно за 24 ч — уважительно", () => {
    expect(classifyClientCancellation(lesson, new Date("2026-11-01T06:00:00Z"))).toBe("EXCUSED");
  });
  it("за 23 ч 59 мин — неуважительно", () => {
    expect(classifyClientCancellation(lesson, new Date("2026-11-01T06:01:00Z"))).toBe("UNEXCUSED");
  });
});

describe("lessonDisplayStatus", () => {
  it.each([
    ["PLANNED", null, false, [], "planned"],
    ["DONE", null, false, ["PRESENT"], "done"],
    ["DONE", null, false, ["ABSENT_UNEXCUSED"], "unexcused"],
    ["DONE", null, true, ["ABSENT_UNEXCUSED", "PRESENT"], "done"],
    ["CANCELLED", "CLIENT", false, ["ABSENT_EXCUSED"], "excused"],
    ["CANCELLED", "SCHOOL", false, [], "cancelled"],
    ["CANCELLED", "CLIENT", true, [], "cancelled"],
    ["MOVED", null, false, [], "moved"],
  ] as const)("%s/%s/группа=%s → %s", (status, by, isGroup, att, expected) => {
    expect(lessonDisplayStatus(status, by, isGroup, att)).toBe(expected);
  });
});
