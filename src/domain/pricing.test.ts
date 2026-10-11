import { describe, expect, it } from "vitest";
import { lessonHours, lessonPrice, tariffOn, type TariffRow } from "./pricing";

describe("lessonHours", () => {
  it.each([
    [45, 0.75],
    [60, 1],
    [90, 1.5],
    [120, 2],
  ])("%i мин → %d ч", (min, h) => expect(lessonHours(min)).toBe(h));

  it.each([0, -60, 50, 61.5])("некорректная длительность %d → ошибка", (min) => {
    expect(() => lessonHours(min)).toThrow(RangeError);
  });
});

describe("lessonPrice", () => {
  it("0,75 ч × 1 300 = 975", () => expect(lessonPrice(0.75, 1300)).toBe(975));
  it("1,5 ч × 1 500 = 2 250", () => expect(lessonPrice(1.5, 1500)).toBe(2250));
  it("групповой 1,5 ч × 900 = 1 350", () => expect(lessonPrice(1.5, 900)).toBe(1350));
});

describe("tariffOn", () => {
  const tariffs: TariffRow[] = [
    { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 1400, validFrom: "2026-01-01" },
    { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 1500, validFrom: "2026-09-01" },
    { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "PER_LESSON", pricePerHour: 1700, validFrom: "2026-09-01" },
    { kind: "GROUP", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 900, validFrom: "2026-09-01" },
  ];
  const key = { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY" } as const;

  it("берёт последний тариф, начавший действовать к дате", () => {
    expect(tariffOn(tariffs, key, "2026-11-01").pricePerHour).toBe(1500);
  });

  it("день начала действия включается", () => {
    expect(tariffOn(tariffs, key, "2026-09-01").pricePerHour).toBe(1500);
    expect(tariffOn(tariffs, key, "2026-08-31").pricePerHour).toBe(1400);
  });

  it("групповой тариф отделён от индивидуального", () => {
    expect(tariffOn(tariffs, { ...key, kind: "GROUP" }, "2026-11-01").pricePerHour).toBe(900);
  });

  it("нет тарифа на дату → ошибка", () => {
    expect(() => tariffOn(tariffs, key, "2025-12-31")).toThrow(/Нет тарифа/);
    expect(() => tariffOn(tariffs, { ...key, program: "SCHOOL" }, "2026-11-01")).toThrow();
  });
});
