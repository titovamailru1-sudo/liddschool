import { describe, expect, it } from "vitest";
import { defaultTariffName, lessonHours, lessonPrice, rateFor, tariffOn, type TariffRow } from "./pricing";

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

describe("тарифы", () => {
  const row = (over: Partial<TariffRow>): TariffRow => ({
    tariffId: "exam-m",
    name: "ОГЭ/ЕГЭ · индивидуально · абонемент",
    isDefault: true,
    kind: "INDIVIDUAL",
    program: "EXAM",
    paymentMode: "MONTHLY",
    pricePerHour: 1500,
    validFrom: "2026-09-01",
    ...over,
  });
  const tariffs: TariffRow[] = [
    row({ pricePerHour: 1400, validFrom: "2026-01-01" }),
    row({}),
    row({ tariffId: "exam-p", paymentMode: "PER_LESSON", pricePerHour: 1700 }),
    row({ tariffId: "grp", kind: "GROUP", pricePerHour: 900 }),
    // Свой тариф ученика: «Льготный», 1 200 ₽ с 01.10, 1 250 ₽ с 01.12
    row({ tariffId: "vip", name: "Льготный", isDefault: false, pricePerHour: 1200, validFrom: "2026-10-01" }),
    row({ tariffId: "vip", name: "Льготный", isDefault: false, pricePerHour: 1250, validFrom: "2026-12-01" }),
  ];
  const key = { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY" } as const;

  it("тариф школы — последняя цена, начавшая действовать к дате", () => {
    expect(tariffOn(tariffs, key, "2026-11-01").pricePerHour).toBe(1500);
  });

  it("день начала действия включается", () => {
    expect(tariffOn(tariffs, key, "2026-09-01").pricePerHour).toBe(1500);
    expect(tariffOn(tariffs, key, "2026-08-31").pricePerHour).toBe(1400);
  });

  it("групповой тариф отделён от индивидуального; свой тариф ученика не считается тарифом школы", () => {
    expect(tariffOn(tariffs, { ...key, kind: "GROUP" }, "2026-11-01").pricePerHour).toBe(900);
    expect(tariffOn(tariffs, key, "2026-12-15").pricePerHour).toBe(1500);
  });

  it("нет тарифа на дату → ошибка", () => {
    expect(() => tariffOn(tariffs, key, "2025-12-31")).toThrow(/Нет тарифа/);
    expect(() => tariffOn(tariffs, { ...key, program: "SCHOOL" }, "2026-11-01")).toThrow();
  });

  it("свой тариф ученика: цена на дату урока, история цен", () => {
    expect(rateFor(tariffs, key, "2026-11-10", "vip")).toBe(1200);
    expect(rateFor(tariffs, key, "2026-12-10", "vip")).toBe(1250);
  });

  it("свой тариф ещё не действует на дату — цена школы", () => {
    expect(rateFor(tariffs, key, "2026-09-15", "vip")).toBe(1500);
  });

  it("свой тариф не подходит по способу оплаты (сравнение с поурочной ценой) — цена школы", () => {
    expect(rateFor(tariffs, { ...key, paymentMode: "PER_LESSON" }, "2026-11-10", "vip")).toBe(1700);
    expect(rateFor(tariffs, { ...key, kind: "GROUP" }, "2026-11-10", "vip")).toBe(900);
  });

  it("свой тариф другой программы — цена школы", () => {
    const school = [...tariffs, row({ tariffId: "s-m", program: "SCHOOL", pricePerHour: 1300 })];
    expect(rateFor(school, { ...key, program: "SCHOOL" }, "2026-11-10", "vip")).toBe(1300);
  });

  it("defaultTariffName", () => {
    expect(defaultTariffName(key)).toBe("ОГЭ/ЕГЭ · индивидуально · абонемент");
    expect(defaultTariffName({ kind: "GROUP", program: "SCHOOL", paymentMode: "PER_LESSON" })).toBe("Школьная программа · группа · поурочно");
  });

  it("без своего тарифа — цена школы", () => {
    expect(rateFor(tariffs, key, "2026-11-10", null)).toBe(1500);
  });
});
