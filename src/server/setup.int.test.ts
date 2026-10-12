import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "@/test/db";
import { acceptInvite } from "./payroll/teachers";
import { initSchool } from "./setup";

beforeEach(() => resetDb());
afterAll(() => testDb.$disconnect());

describe("первый запуск школы", () => {
  it("тарифы, шаблон ставки и владелец со ссылкой; повторно — без дублей", async () => {
    const r = await initSchool(testDb, { ownerEmail: "Boss@Lidd.School", ownerName: "Анна Лидд", from: "2026-10-01" });
    expect(r.created).toHaveLength(10);
    expect(r.link).toMatch(/\/invite\/[\w-]+$/);
    expect(await testDb.tariff.count({ where: { isDefault: true } })).toBe(8);
    const plan = await testDb.ratePlan.findFirstOrThrow({ where: { isDefault: true }, include: { tiers: true } });
    expect(plan).toMatchObject({ baseAmount: 700, familyId: plan.id });
    expect(plan.tiers).toHaveLength(2);

    // Владелец задаёт пароль по ссылке.
    await acceptInvite(testDb, r.link.split("/invite/")[1], "очень-надёжный");
    const owner = await testDb.user.findUniqueOrThrow({ where: { email: "boss@lidd.school" } });
    expect(owner.role).toBe("OWNER");

    const again = await initSchool(testDb, { ownerEmail: "boss@lidd.school", ownerName: "", from: "2026-11-01" });
    expect(again.created).toEqual([]);
    expect(await testDb.tariff.count()).toBe(8);
    expect(await testDb.ratePlan.count()).toBe(1);
  });

  it("email занят не владельцем — ошибка", async () => {
    await testDb.user.create({ data: { email: "admin@lidd.school", name: "Админ", role: "ADMIN", passwordHash: "x" } });
    await expect(initSchool(testDb, { ownerEmail: "admin@lidd.school", ownerName: "", from: "2026-10-01" })).rejects.toThrow(/не владелец/);
  });
});
