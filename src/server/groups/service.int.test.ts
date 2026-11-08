import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { startOfDay } from "@/domain/calendar";
import { resetDb, seedBasics, testDb } from "@/test/db";
import { clientLessons } from "../billing/clientLessons";
import { createLessons } from "../lessons/service";
import { addGroupMember, createGroup, removeGroupMember, updateGroup } from "./service";

let ctx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
});
afterAll(() => testDb.$disconnect());

const input = (over = {}) => ({ name: "ОГЭ-9Б", subject: "математика", program: "EXAM" as const, teacherId: ctx.teacher.id, maxStudents: 2, ...over });
const NOV = { gte: startOfDay("2026-11-01"), lt: startOfDay("2026-12-01") };

/** Группа по вторникам 17:00 с 03.11.2026 бессрочно. */
async function groupWithSchedule() {
  const g = await createGroup(testDb, ctx.admin.id, input());
  const r = await createLessons(
    testDb,
    ctx.actor,
    { teacherId: ctx.teacher.id, groupId: g.id, subject: "математика", date: "2026-11-03", time: "17:00", durationMin: 90, repeat: { kind: "weekly", weekdays: [2], until: null } },
    "2026-11-01",
  );
  if (!r.ok) throw new Error("расписание не создано");
  return g;
}

describe("группы", () => {
  it("ученик с 10.11 — его уроки группы с 10.11; вышел с 24.11 — последний урок 17.11", async () => {
    const g = await groupWithSchedule();
    await addGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-11-10");
    let lessons = await clientLessons(testDb, ctx.monthly.id, NOV);
    expect(lessons.map((l) => l.startsAt.toISOString().slice(0, 10))).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);

    await removeGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-11-24");
    lessons = await clientLessons(testDb, ctx.monthly.id, NOV);
    expect(lessons.map((l) => l.startsAt.toISOString().slice(0, 10))).toEqual(["2026-11-10", "2026-11-17"]);
  });

  it("повторное вступление, дубли и заполненность", async () => {
    const g = await createGroup(testDb, ctx.admin.id, input());
    await addGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-11-01");
    await expect(addGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-11-02")).rejects.toThrow(/уже в группе/);
    await addGroupMember(testDb, ctx.admin.id, g.id, ctx.perLesson.id, "2026-11-01");
    const third = await testDb.client.create({ data: { fullName: "Третий Ученик", program: "EXAM", paymentMode: "MONTHLY" } });
    await expect(addGroupMember(testDb, ctx.admin.id, g.id, third.id, "2026-11-01")).rejects.toThrow(/2 из 2/);

    await removeGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-11-15");
    await addGroupMember(testDb, ctx.admin.id, g.id, third.id, "2026-11-15");
    await expect(updateGroup(testDb, ctx.admin.id, g.id, { ...input(), maxStudents: 1, isActive: true }, "2026-11-15")).rejects.toThrow(/Максимум меньше/);

    // Вернулся — одна запись участия, новый период.
    await removeGroupMember(testDb, ctx.admin.id, g.id, third.id, "2026-11-20");
    await addGroupMember(testDb, ctx.admin.id, g.id, ctx.monthly.id, "2026-12-01");
    const m = await testDb.groupMember.findMany({ where: { groupId: g.id, clientId: ctx.monthly.id } });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ joinedAt: startOfDay("2026-12-01"), leftAt: null });
  });

  it("сменить педагога можно только без действующего расписания", async () => {
    const g = await groupWithSchedule();
    await expect(updateGroup(testDb, ctx.admin.id, g.id, { ...input(), teacherId: ctx.teacher2.id, isActive: true }, "2026-11-05")).rejects.toThrow(/действующее расписание/);
    const clean = await createGroup(testDb, ctx.admin.id, input({ name: "Пустая" }));
    await updateGroup(testDb, ctx.admin.id, clean.id, { ...input({ name: "Пустая" }), teacherId: ctx.teacher2.id, isActive: true }, "2026-11-05");
    expect((await testDb.group.findUniqueOrThrow({ where: { id: clean.id } })).teacherId).toBe(ctx.teacher2.id);
  });

  it("название активной группы не повторяется", async () => {
    await createGroup(testDb, ctx.admin.id, input());
    await expect(createGroup(testDb, ctx.admin.id, input({ name: "огэ-9б" }))).rejects.toThrow(/уже есть/);
  });
});
