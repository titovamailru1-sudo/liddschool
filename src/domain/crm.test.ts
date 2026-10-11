import { describe, expect, it } from "vitest";
import {
  calcOffer,
  changePercent,
  leadConversion,
  leadNeedsTouch,
  periodOf,
  previousPeriod,
  renderOfferMessage,
  taskDisplayStatus,
  wholeMonths,
} from "./crm";

describe("taskDisplayStatus", () => {
  const now = new Date("2026-10-12T05:00:00Z");
  it("срок прошёл и не выполнена — просрочена", () => {
    expect(taskDisplayStatus("NEW", new Date("2026-10-12T04:59:00Z"), now)).toBe("overdue");
    expect(taskDisplayStatus("IN_PROGRESS", new Date("2026-10-11T00:00:00Z"), now)).toBe("overdue");
  });
  it("выполненная не бывает просроченной", () => {
    expect(taskDisplayStatus("DONE", new Date("2026-10-01T00:00:00Z"), now)).toBe("done");
  });
  it("без срока или срок впереди — по статусу", () => {
    expect(taskDisplayStatus("NEW", null, now)).toBe("new");
    expect(taskDisplayStatus("IN_PROGRESS", new Date("2026-10-13T00:00:00Z"), now)).toBe("inProgress");
  });
});

describe("лиды", () => {
  it("конверсия в оплату по источникам", () => {
    const r = leadConversion([
      { source: "AVITO", stage: "WON" },
      { source: "AVITO", stage: "LOST" },
      { source: "AVITO", stage: "NEW" },
      { source: "SITE", stage: "WON" },
    ]);
    expect(r.rows[0]).toEqual({ source: "AVITO", total: 3, won: 1, lost: 1, inProgress: 1, conversion: 33.3 });
    expect(r.rows[1]).toMatchObject({ source: "SITE", conversion: 100 });
    expect(r.total).toMatchObject({ total: 4, won: 2, conversion: 50 });
  });

  it("пусто — 0 %", () => {
    expect(leadConversion([]).total.conversion).toBe(0);
  });

  it("касание нужно, если больше 2 суток без контакта и заявка в работе", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    const created = new Date("2026-10-01T00:00:00Z");
    expect(leadNeedsTouch("CONTACTED", new Date("2026-10-09T23:00:00Z"), created, now)).toBe(true);
    expect(leadNeedsTouch("CONTACTED", new Date("2026-10-10T01:00:00Z"), created, now)).toBe(false);
    expect(leadNeedsTouch("NEW", null, created, now)).toBe(true); // без касаний — от даты заявки
    expect(leadNeedsTouch("WON", null, created, now)).toBe(false);
  });
});

describe("расчёт предложения", () => {
  it("ЕГЭ, вт + пт по 60 мин, ноябрь 2026: 8 × 1 500 = 12 000; поурочно 13 600", () => {
    const o = calcOffer({ slots: [{ weekday: 2, durationMin: 60 }, { weekday: 5, durationMin: 60 }], year: 2026, month: 11, monthlyRate: 1500, perLessonRate: 1700 });
    expect(o).toMatchObject({ lessonsCount: 8, amount: 12000, perLessonAmount: 13600, savings: 1600 });
  });

  it("текст предложения родителю", () => {
    const offer = calcOffer({ slots: [{ weekday: 7, durationMin: 60 }], year: 2026, month: 11, monthlyRate: 1500, perLessonRate: 1700 });
    const text = renderOfferMessage({ parentName: "Ольга", childName: "Миши", subject: "математике", slots: [{ weekday: 7, durationMin: 60 }], month: 11, offer, perLessonRate: 1700 });
    expect(text).toContain("вс 60 мин. В ноябре — 5 занятий.");
    expect(text).toContain("Абонемент на месяц: 5 × 1 500 ₽ = 7 500 ₽.");
    expect(text).toContain("абонемент выгоднее на 1 000 ₽.");
  });
});

describe("периоды отчётов", () => {
  it("неделя, месяц, квартал", () => {
    expect(periodOf("week", "2026-10-14")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodOf("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodOf("quarter", "2026-11-05")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("предыдущий период", () => {
    expect(previousPeriod("month", { from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previousPeriod("quarter", { from: "2026-01-01", to: "2026-03-31" })).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(previousPeriod("custom", { from: "2026-10-10", to: "2026-10-19" })).toEqual({ from: "2026-09-30", to: "2026-10-09" });
  });

  it("целые месяцы внутри периода — для надбавки", () => {
    expect(wholeMonths({ from: "2026-10-01", to: "2026-12-31" })).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
    ]);
    expect(wholeMonths({ from: "2026-10-05", to: "2026-11-30" })).toEqual([{ year: 2026, month: 11 }]);
    expect(wholeMonths({ from: "2026-10-12", to: "2026-10-18" })).toEqual([]);
  });

  it("изменение к прошлому периоду", () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(5, 0)).toBeNull();
    expect(changePercent(0, 0)).toBe(0);
  });
});
