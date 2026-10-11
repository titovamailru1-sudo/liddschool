import { describe, expect, it } from "vitest";
import { calcMonthlyInvoice, describeLessonDates, renderInvoiceMessage } from "./monthlyInvoice";
import { occurrencesInMonth, type SeriesInput } from "./schedule";

const s = (id: string, weekday: number, startTime = "16:00", durationMin = 60, startsOn = "2026-09-01"): SeriesInput => ({
  id,
  weekday,
  startTime,
  durationMin,
  startsOn,
  endsOn: null,
});

const nov = (list: SeriesInput[]) => occurrencesInMonth(list, 2026, 11);

describe("calcMonthlyInvoice", () => {
  it("срок оплаты — 1-е число месяца счёта", () => {
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: [], monthlyRate: 1500, perLessonRate: 1700, balance: 0 });
    expect(inv.dueDate).toBe("2026-11-01");
    expect(inv.total).toBe(0);
  });

  it("уроки разной длительности считаются по урок-часам", () => {
    // вт 90 мин (4 урока = 6 ч) + пт 45 мин (4 урока = 3 ч) → 9 ч
    const inv = calcMonthlyInvoice({
      year: 2026,
      month: 11,
      lessons: nov([s("a", 2, "16:00", 90), s("b", 5, "16:00", 45)]),
      monthlyRate: 1500,
      perLessonRate: 1700,
      balance: 0,
    });
    expect(inv.lessonsCount).toBe(8);
    expect(inv.hours).toBe(9);
    expect(inv.amount).toBe(13500);
    expect(inv.perLessonAmount).toBe(15300);
  });

  it("ученик добавлен в середине месяца — счёт только на оставшиеся уроки", () => {
    const inv = calcMonthlyInvoice({
      year: 2026,
      month: 11,
      lessons: nov([s("a", 7, "16:00", 60, "2026-11-17")]),
      monthlyRate: 1500,
      perLessonRate: 1700,
      balance: 0,
    });
    expect(inv.lessonsCount).toBe(2);
    expect(inv.amount).toBe(3000);
  });

  it("переплата вычитается из счёта", () => {
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: nov([s("a", 7)]), monthlyRate: 1500, perLessonRate: 1700, balance: 1500 });
    expect(inv.creditApplied).toBe(1500);
    expect(inv.debtIncluded).toBe(0);
    expect(inv.total).toBe(6000);
  });

  it("переплата больше счёта — к оплате 0, остаток переплаты не теряется (вычитаем не больше суммы)", () => {
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: nov([s("a", 7)]), monthlyRate: 1500, perLessonRate: 1700, balance: 10000 });
    expect(inv.creditApplied).toBe(7500);
    expect(inv.total).toBe(0);
  });
});

describe("describeLessonDates", () => {
  it("группирует по дню недели и времени, начиная с понедельника", () => {
    const text = describeLessonDates(nov([s("fri", 5, "17:30"), s("tue", 2, "16:00")]));
    expect(text).toBe("вт 03.11, 10.11, 17.11, 24.11 в 16:00; пт 06.11, 13.11, 20.11, 27.11 в 17:30");
  });
});

describe("renderInvoiceMessage", () => {
  const lessons = nov([s("sun", 7)]);
  const base = {
    parentName: "Ольга Петровна",
    studentNameGen: "Миши Иванова",
    subjects: ["математика"],
    year: 2026,
    month: 11,
    lessons,
    monthlyRate: 1500,
    perLessonRate: 1700,
    payUrl: "https://pay.example/inv1",
  };

  it("без долга", () => {
    const calc = calcMonthlyInvoice({ ...base, balance: 0 });
    expect(renderInvoiceMessage({ ...base, calc })).toBe(
      [
        "Здравствуйте, Ольга Петровна! В ноябре у Миши Иванова 5 занятий по математике: вс 01.11, 08.11, 15.11, 22.11, 29.11 в 16:00.",
        "Абонемент на ноябрь: 5 × 1 500 ₽ = 7 500 ₽.",
        "При поурочной оплате вышло бы 5 × 1 700 ₽ = 8 500 ₽, абонемент выгоднее на 1 000 ₽.",
        "Итого к оплате: 7 500 ₽ до 01.11.",
        "Оплатить: https://pay.example/inv1. Lidd School",
      ].join("\n"),
    );
  });

  it("с долгом", () => {
    const calc = calcMonthlyInvoice({ ...base, balance: -1700 });
    expect(renderInvoiceMessage({ ...base, calc })).toContain(
      "Также есть задолженность 1 700 ₽. Итого к оплате: 9 200 ₽ до 01.11.",
    );
  });

  it("один урок — «1 занятие», несколько предметов", () => {
    const one = nov([s("a", 7, "16:00", 60, "2026-11-29")]);
    const calc = calcMonthlyInvoice({ ...base, lessons: one, balance: 0 });
    const text = renderInvoiceMessage({ ...base, lessons: one, calc, subjects: ["математика", "информатика"] });
    expect(text).toContain("1 занятие по математике и информатике: вс 29.11 в 16:00");
  });

  it("уроки по 90 мин — количество в урок-часах", () => {
    const l = nov([s("a", 7, "16:00", 90)]);
    const calc = calcMonthlyInvoice({ ...base, lessons: l, balance: 0 });
    expect(renderInvoiceMessage({ ...base, lessons: l, calc })).toContain("Абонемент на ноябрь: 7,5 ч × 1 500 ₽ = 11 250 ₽.");
  });
});
