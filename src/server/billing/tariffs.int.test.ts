import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedBasics, testDb } from "@/test/db";
import { createLessons } from "../lessons/service";
import { buildInvoiceDraft } from "./invoices";
import { processPerLesson } from "./perLesson";
import {
  checkClientTariff,
  clientTariffOptions,
  createTariff,
  deleteTariff,
  deleteTariffPrice,
  listTariffs,
  setTariffPrice,
  updateTariff,
} from "./tariffs";

let ctx: Awaited<ReturnType<typeof seedBasics>>;
const TODAY = "2026-10-12";

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
});
afterAll(() => testDb.$disconnect());

const vip = (over: Partial<Parameters<typeof createTariff>[2]> = {}) =>
  createTariff(testDb, ctx.admin.id, {
    name: "Льготный ЕГЭ",
    kind: "INDIVIDUAL",
    program: "EXAM",
    paymentMode: "MONTHLY",
    pricePerHour: 1200,
    validFrom: "2026-10-01",
    ...over,
  });

/** Миша (ЕГЭ, абонемент): по воскресеньям в 16:00 с 04.10.2026 — в ноябре 5 уроков. */
async function sundaySeries() {
  const r = await createLessons(
    testDb,
    ctx.actor,
    {
      teacherId: ctx.teacher.id,
      clientId: ctx.monthly.id,
      subject: "математика",
      date: "2026-10-04",
      time: "16:00",
      durationMin: 60,
      repeat: { kind: "weekly", weekdays: [7], until: null },
    },
    "2026-10-01",
  );
  if (!r.ok) throw new Error("серия не создана");
}

describe("тарифы: справочник", () => {
  it("тарифы школы первыми, у каждого действующая цена", async () => {
    await vip();
    const list = await listTariffs(testDb, TODAY);
    expect(list).toHaveLength(9);
    expect(list[0]).toMatchObject({ name: "ОГЭ/ЕГЭ · индивидуально · абонемент", isDefault: true, current: { pricePerHour: 1500 } });
    expect(list.at(-1)).toMatchObject({ name: "Льготный ЕГЭ", isDefault: false, current: { pricePerHour: 1200 } });
  });

  it("название уникально без учёта регистра", async () => {
    await vip();
    await expect(vip({ name: "льготный егэ" })).rejects.toThrow(/уже есть/);
  });

  it("цена с будущей даты попадает в запланированные; прошлой датой задать нельзя", async () => {
    const t = await vip();
    await setTariffPrice(testDb, ctx.admin.id, t.id, 1250, "2026-12-01", TODAY);
    const item = (await listTariffs(testDb, TODAY)).find((x) => x.id === t.id)!;
    expect(item.current?.pricePerHour).toBe(1200);
    expect(item.upcoming).toMatchObject([{ pricePerHour: 1250, validFrom: "2026-12-01" }]);
    await expect(setTariffPrice(testDb, ctx.admin.id, t.id, 1100, "2026-10-11", TODAY)).rejects.toThrow(/сегодняшнего дня/);
  });

  it("запланированную цену можно удалить, прошлую и единственную — нет", async () => {
    const t = await vip();
    const future = await setTariffPrice(testDb, ctx.admin.id, t.id, 1250, "2026-12-01", TODAY);
    const past = await testDb.tariffPrice.findFirstOrThrow({ where: { tariffId: t.id, id: { not: future.id } } });
    await expect(deleteTariffPrice(testDb, ctx.admin.id, past.id, TODAY)).rejects.toThrow(/Прошлые цены/);
    await deleteTariffPrice(testDb, ctx.admin.id, future.id, TODAY);
    expect(await testDb.tariffPrice.count({ where: { tariffId: t.id } })).toBe(1);

    const fresh = await vip({ name: "Новый", validFrom: "2026-11-01" });
    const only = await testDb.tariffPrice.findFirstOrThrow({ where: { tariffId: fresh.id } });
    await expect(deleteTariffPrice(testDb, ctx.admin.id, only.id, TODAY)).rejects.toThrow(/единственная/);
  });

  it("у тарифа школы меняется только название; тариф с учениками не меняет формат и не удаляется", async () => {
    const school = await testDb.tariff.findFirstOrThrow({ where: { isDefault: true, kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY" } });
    await updateTariff(testDb, ctx.admin.id, school.id, { name: "ЕГЭ абонемент", kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY" });
    await expect(
      updateTariff(testDb, ctx.admin.id, school.id, { name: "ЕГЭ абонемент", kind: "INDIVIDUAL", program: "SCHOOL", paymentMode: "MONTHLY" }),
    ).rejects.toThrow(/только название/);
    await expect(deleteTariff(testDb, ctx.admin.id, school.id)).rejects.toThrow(/школы удалить нельзя/);

    const t = await vip();
    await testDb.client.update({ where: { id: ctx.monthly.id }, data: { tariffId: t.id } });
    await expect(
      updateTariff(testDb, ctx.admin.id, t.id, { name: "Льготный", kind: "INDIVIDUAL", program: "EXAM", paymentMode: "PER_LESSON" }),
    ).rejects.toThrow(/назначен ученикам/);
    await expect(deleteTariff(testDb, ctx.admin.id, t.id)).rejects.toThrow(/назначен ученикам/);

    await testDb.client.update({ where: { id: ctx.monthly.id }, data: { tariffId: null } });
    await deleteTariff(testDb, ctx.admin.id, t.id);
    expect(await testDb.tariff.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await testDb.auditLog.count({ where: { entity: "Tariff", entityId: t.id } })).toBe(2);
  });

  it("ученику — только свой индивидуальный тариф его программы и способа оплаты", async () => {
    const t = await vip();
    await vip({ name: "Группа льгота", kind: "GROUP" });
    expect((await clientTariffOptions(testDb, TODAY)).map((o) => o.name)).toEqual(["Льготный ЕГЭ"]);
    await checkClientTariff(testDb, t.id, "EXAM", "MONTHLY");
    await expect(checkClientTariff(testDb, t.id, "EXAM", "PER_LESSON")).rejects.toThrow(/не подходит/);
    await expect(checkClientTariff(testDb, t.id, "SCHOOL", "MONTHLY")).rejects.toThrow(/не подходит/);
  });
});

describe("тарифы: расчёт по тарифу ученика", () => {
  it("счёт абонемента по своему тарифу; поурочная цена для сравнения — школы", async () => {
    const t = await vip();
    await testDb.client.update({ where: { id: ctx.monthly.id }, data: { tariffId: t.id } });
    await sundaySeries();
    const draft = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    expect(draft).toMatchObject({ ok: true, total: 5 * 1200 });
    const inv = await testDb.monthlyInvoice.findFirstOrThrow({ where: { clientId: ctx.monthly.id } });
    expect(inv.perLessonAmount).toBe(5 * 1700);
  });

  it("новая цена своего тарифа действует с даты: 01 и 08.11 по 1 200, остальные по 1 250", async () => {
    const t = await vip();
    await setTariffPrice(testDb, ctx.admin.id, t.id, 1250, "2026-11-15", TODAY);
    await testDb.client.update({ where: { id: ctx.monthly.id }, data: { tariffId: t.id } });
    await sundaySeries();
    expect(await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11)).toMatchObject({ ok: true, total: 2 * 1200 + 3 * 1250 });
  });

  it("поурочник со своим тарифом: ссылка на оплату по его цене", async () => {
    const t = await vip({ name: "Поурочный льготный", paymentMode: "PER_LESSON", pricePerHour: 1600 });
    await testDb.client.update({ where: { id: ctx.perLesson.id }, data: { tariffId: t.id } });
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.perLesson.id, subject: "математика", date: "2026-10-14", time: "16:00", durationMin: 90, repeat: { kind: "once" } },
      TODAY,
    );
    expect(r.ok).toBe(true);
    await processPerLesson(testDb, new Date("2026-10-13T00:00:00Z"));
    const link = await testDb.paymentLink.findFirstOrThrow({ where: { clientId: ctx.perLesson.id } });
    expect(link.amount).toBe(1.5 * 1600);
  });
});
