import { describe, expect, it } from "vitest";
import {
  coverage,
  finalLesson,
  invoicedLessonOutcome,
  invoiceTarget,
  isBillableExtra,
  paymentQrString,
  payeeComplete,
  perLessonActions,
  renderLessonPaymentMessage,
  type LessonNode,
} from "./billing";
import { calcMonthlyInvoice, rateBreakdown, renderInvoiceMessage } from "./monthlyInvoice";
import { occurrencesInMonth } from "./schedule";

const RULES = { creditOnSchoolCancel: true, creditOnExcused: true };
const node = (over: Partial<LessonNode> & { id: string }): LessonNode => ({
  startsAt: new Date("2026-10-14T06:00:00Z"),
  status: "PLANNED",
  cancelledBy: null,
  movedToId: null,
  attendance: null,
  ...over,
});

describe("перенос разницы: что стало с оплаченным уроком", () => {
  it("отменён школой без новой даты — вычет", () => {
    const r = invoicedLessonOutcome(node({ id: "a", status: "CANCELLED", cancelledBy: "SCHOOL" }), RULES);
    expect(r).toEqual({ kind: "credit", reason: "урок 14.10 отменён школой" });
  });

  it("перенесён на другой день этого месяца — без вычета (урок состоится)", () => {
    const byId = new Map([
      ["a", node({ id: "a", status: "MOVED", movedToId: "b" })],
      ["b", node({ id: "b", startsAt: new Date("2026-10-16T06:00:00Z") })],
    ]);
    expect(invoicedLessonOutcome(finalLesson("a", byId), RULES).kind).toBe("consumed");
  });

  it("перенесён, а новый урок потом отменён школой — вычет", () => {
    const byId = new Map([
      ["a", node({ id: "a", status: "MOVED", movedToId: "b" })],
      ["b", node({ id: "b", status: "CANCELLED", cancelledBy: "SCHOOL" })],
    ]);
    expect(invoicedLessonOutcome(finalLesson("a", byId), RULES).kind).toBe("credit");
  });

  it("цепочка переноса не загружена — ждём", () => {
    const byId = new Map([["a", node({ id: "a", status: "MOVED", movedToId: "zzz" })]]);
    expect(invoicedLessonOutcome(finalLesson("a", byId), RULES).kind).toBe("pending");
  });

  it("отмена клиентом заранее и уважительный пропуск в группе — вычет; неуважительный — нет", () => {
    expect(invoicedLessonOutcome(node({ id: "a", status: "CANCELLED", cancelledBy: "CLIENT" }), RULES).kind).toBe("credit");
    expect(invoicedLessonOutcome(node({ id: "a", status: "DONE", attendance: "ABSENT_EXCUSED" }), RULES).kind).toBe("credit");
    expect(invoicedLessonOutcome(node({ id: "a", status: "DONE", attendance: "ABSENT_UNEXCUSED" }), RULES).kind).toBe("consumed");
  });

  it("правила переноса можно выключить в настройках", () => {
    const off = { creditOnSchoolCancel: false, creditOnExcused: false };
    expect(invoicedLessonOutcome(node({ id: "a", status: "CANCELLED", cancelledBy: "SCHOOL" }), off).kind).toBe("consumed");
  });

  it("доплата за добавленный урок — если он не отменён и не уважительный пропуск", () => {
    expect(isBillableExtra(node({ id: "x" }))).toBe(true);
    expect(isBillableExtra(node({ id: "x", status: "CANCELLED", cancelledBy: "SCHOOL" }))).toBe(false);
    expect(isBillableExtra(node({ id: "x", status: "DONE", attendance: "ABSENT_EXCUSED" }))).toBe(false);
  });
});

describe("счёт с переносом разницы и разными тарифами", () => {
  const sundays = occurrencesInMonth(
    [{ id: "s", weekday: 7, startTime: "16:00", durationMin: 60, startsOn: "2026-09-01", endsOn: null }],
    2026,
    11,
  );

  it("вычет за отменённый урок уменьшает итог", () => {
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: sundays, monthlyRate: 1500, perLessonRate: 1700, balance: 0, adjustments: -1500 });
    expect(inv.amount).toBe(7500);
    expect(inv.adjustmentsTotal).toBe(-1500);
    expect(inv.total).toBe(6000);
  });

  it("вычет больше счёта — к оплате 0", () => {
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: [], monthlyRate: 1500, perLessonRate: 1700, balance: 0, adjustments: -1500 });
    expect(inv.total).toBe(0);
  });

  it("индивидуальные + групповые уроки по разным тарифам", () => {
    const group = occurrencesInMonth(
      [{ id: "g", weekday: 6, startTime: "10:00", durationMin: 90, startsOn: "2026-09-01", endsOn: null }],
      2026,
      11,
    ).map((o) => ({ ...o, monthlyRate: 800, perLessonRate: 1000 }));
    const inv = calcMonthlyInvoice({ year: 2026, month: 11, lessons: [...sundays, ...group], monthlyRate: 1500, perLessonRate: 1700, balance: 0 });
    // 5 × 1 500 + 4 × 1,5 ч × 800 = 7 500 + 4 800
    expect(inv.amount).toBe(12300);
    expect(rateBreakdown(inv.lines, "monthlyRate")).toBe("5 × 1 500 ₽ + 6 ч × 800 ₽");
  });

  it("сообщение с перерасчётом", () => {
    const calc = calcMonthlyInvoice({ year: 2026, month: 11, lessons: sundays, monthlyRate: 1500, perLessonRate: 1700, balance: 0, adjustments: -1500 });
    const text = renderInvoiceMessage({
      parentName: "Ольга Петровна",
      studentNameGen: "Миши Иванова",
      subjects: ["математика"],
      year: 2026,
      month: 11,
      lessons: sundays,
      monthlyRate: 1500,
      perLessonRate: 1700,
      calc,
      payUrl: "https://pay.example/x",
      adjustmentNotes: [{ amount: -1500, reason: "урок 14.10 отменён школой" }],
    });
    expect(text).toContain("Перерасчёт за прошлый месяц: −1 500 ₽ (урок 14.10 отменён школой).");
    expect(text).toContain("Итого к оплате: 6 000 ₽ до 01.11.");
  });
});

describe("когда формировать счета", () => {
  it("с 25-го — на следующий месяц, раньше — нет", () => {
    expect(invoiceTarget("2026-10-24", 25)).toBeNull();
    expect(invoiceTarget("2026-10-25", 25)).toEqual({ year: 2026, month: 11 });
    expect(invoiceTarget("2026-12-31", 25)).toEqual({ year: 2027, month: 1 });
  });
});

describe("поурочная оплата", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 20, 0, 0) + h * 3_600_000);

  it("баланс покрывает уроки по порядку", () => {
    const c = coverage(2000, [
      { id: "b", startsAt: at(48), price: 1700 },
      { id: "a", startsAt: at(24), price: 1500 },
    ]);
    expect(c.get("a")).toBe(true);
    expect(c.get("b")).toBe(false);
  });

  it("долг — ни один урок не покрыт", () => {
    expect(coverage(-500, [{ id: "a", startsAt: at(10), price: 1500 }]).get("a")).toBe(false);
  });

  const now = at(0);
  it("за 48 ч — отправить ссылку; раньше — нет; уже отправлена — нет", () => {
    const s = { covered: false, linkSentAt: null, atRiskAt: null };
    expect(perLessonActions(now, { ...s, startsAt: at(49) }).sendLink).toBe(false);
    expect(perLessonActions(now, { ...s, startsAt: at(48) }).sendLink).toBe(true);
    expect(perLessonActions(now, { ...s, startsAt: at(30), linkSentAt: now }).sendLink).toBe(false);
  });

  it("за 24 ч без оплаты — «под угрозой»; оплатили — снять пометку", () => {
    expect(perLessonActions(now, { startsAt: at(23), covered: false, linkSentAt: now, atRiskAt: null }).markAtRisk).toBe(true);
    expect(perLessonActions(now, { startsAt: at(23), covered: true, linkSentAt: now, atRiskAt: now }).clearAtRisk).toBe(true);
  });

  it("покрытый балансом урок — ссылка не нужна", () => {
    const r = perLessonActions(now, { startsAt: at(20), covered: true, linkSentAt: null, atRiskAt: null });
    expect(r).toEqual({ sendLink: false, markAtRisk: false, clearAtRisk: false });
  });

  it("прошедший урок — ничего не делаем", () => {
    const r = perLessonActions(now, { startsAt: at(-1), covered: false, linkSentAt: null, atRiskAt: null });
    expect(r.sendLink || r.markAtRisk).toBe(false);
  });

  it("сообщение со ссылкой и сроком оплаты", () => {
    const text = renderLessonPaymentMessage({
      parentName: "Елена Викторовна",
      studentNameGen: "Алисы Соколовой",
      subject: "информатика",
      startsAt: new Date("2026-10-21T08:00:00Z"),
      durationMin: 90,
      amount: 2550,
      deadline: new Date("2026-10-20T08:00:00Z"),
      payUrl: "https://pay.example/l1",
    });
    expect(text).toBe(
      "Здравствуйте, Елена Викторовна! 21.10.2026 в 18:00 у Алисы Соколовой занятие по информатике (90 мин).\n" +
        "К оплате: 2 550 ₽ до 20.10.2026 18:00.\n" +
        "Оплатить: https://pay.example/l1. Lidd School",
    );
  });
});

describe("платёжный QR (ГОСТ Р 56042-2014)", () => {
  const d = {
    name: "ИП Иванова А.А.",
    personalAcc: "40802810000000000001",
    bankName: "ПАО Банк",
    bic: "040507000",
    correspAcc: "30101810000000000700",
    payeeInn: "253600000000",
  };
  it("сумма в копейках, разделители из значений убираются", () => {
    expect(paymentQrString(d, 7500, "Абонемент | ноябрь")).toBe(
      "ST00012|Name=ИП Иванова А.А.|PersonalAcc=40802810000000000001|BankName=ПАО Банк|BIC=040507000|" +
        "CorrespAcc=30101810000000000700|PayeeINN=253600000000|Sum=750000|Purpose=Абонемент   ноябрь",
    );
  });
  it("неполные реквизиты — QR не показываем", () => {
    expect(payeeComplete(d)).toBe(true);
    expect(payeeComplete({ ...d, bic: "123" })).toBe(false);
    expect(payeeComplete(null)).toBe(false);
  });
});
