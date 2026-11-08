import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "@/test/db";
import { idleLeadTasks } from "../tasks/auto";
import { addLeadTouch, createSiteLead } from "./service";

beforeEach(() => resetDb());
afterAll(() => testDb.$disconnect());

describe("заявка с сайта", () => {
  it("лид «Сайт» без автора и задача администратору; касание закрывает задачу", async () => {
    const admin = await testDb.user.create({ data: { email: "admin@test", name: "Админ", role: "ADMIN", passwordHash: "x" } });
    const at = new Date("2026-11-08T02:00:00Z");
    const lead = await createSiteLead(
      testDb,
      { childName: "Миша", grade: 9, subject: "математика", program: "EXAM", parentName: "Ольга", phone: "+7 914 000-00-01", preferredTime: "после 17:00" },
      at,
    );
    expect(lead).toMatchObject({ source: "SITE", stage: "NEW", ownerId: null });
    const touch = await testDb.leadTouch.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(touch).toMatchObject({ text: "Заявка с сайта", authorId: null });

    const task = await testDb.task.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(task).toMatchObject({ title: "Новая заявка с сайта: Миша", assigneeId: admin.id, isAuto: true, status: "NEW" });
    expect(task.description).toContain("Телефон: +7 914 000-00-01");
    expect(task.dueAt).toEqual(new Date("2026-11-08T04:00:00Z"));

    await addLeadTouch(testDb, admin.id, lead.id, "call", "Позвонили, договорились о пробном");
    await idleLeadTasks(testDb, new Date("2026-11-08T03:00:00Z"));
    expect((await testDb.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  });
});
