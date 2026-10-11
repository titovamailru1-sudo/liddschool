import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "@/domain/calendar";
import { balanceOf, resetDb, seedBasics, testDb } from "@/test/db";
import { acceptPayment } from "./billing/payments";
import { addExpense, cancelExpense, listExpenses } from "./expenses";
import { addLeadTouch, convertLead, createLead, leadOffer, leadStats, scheduleTrial, setLeadStage } from "./leads/service";
import { cancelLesson, createLessons, settle } from "./lessons/service";
import { attendanceStats, financials } from "./reports";
import type { CurrentUser } from "./session";
import { debtTasks, idleLeadTasks, unmarkedLessonTasks } from "./tasks/auto";
import { addTaskComment, createTask, listTasks, overdueCount, setTaskStatus } from "./tasks/service";

let ctx: Awaited<ReturnType<typeof seedBasics>>;
let admin: CurrentUser;
let teacherUser: CurrentUser;

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  const plan = await testDb.ratePlan.findFirstOrThrow();
  await testDb.teacherRatePlan.create({ data: { teacherId: ctx.teacher.id, planId: plan.id, validFrom: toDbDate("2026-01-01") } });
  const tu = await testDb.user.create({ data: { email: "petrova@test", name: "Петрова Анна", role: "TEACHER", passwordHash: "x" } });
  await testDb.teacher.update({ where: { id: ctx.teacher.id }, data: { userId: tu.id } });
  admin = { id: ctx.admin.id, name: "Админ", email: "admin@test", role: "ADMIN", teacherId: null };
  teacherUser = { id: tu.id, name: "Петрова Анна", email: "petrova@test", role: "TEACHER", teacherId: ctx.teacher.id };
});
afterAll(() => testDb.$disconnect());

async function lessonAt(clientId: string, date: string, time = "16:00", durationMin = 60) {
  const r = await createLessons(
    testDb,
    ctx.actor,
    { teacherId: ctx.teacher.id, clientId, subject: "математика", date, time, durationMin, repeat: { kind: "once" } },
    "2026-10-01",
  );
  if (!r.ok) throw new Error("урок не создан");
  return r.value.lessonIds[0];
}

describe("задачи", () => {
  it("педагог видит только свои; просроченные считаются для счётчика; комментарии", async () => {
    const now = new Date("2026-10-12T05:00:00Z");
    await createTask(testDb, admin, { title: "Позвонить маме Миши", assigneeId: ctx.admin.id, dueAt: new Date("2026-10-11T00:00:00Z") });
    const mine = await createTask(testDb, admin, { title: "Подготовить пробник", assigneeId: teacherUser.id, dueAt: new Date("2026-10-20T00:00:00Z") });
    // Педагог ставит задачу только себе, даже если указал другого.
    const self = await createTask(testDb, teacherUser, { title: "Проверить ДЗ", assigneeId: ctx.admin.id });
    expect(self.assigneeId).toBe(teacherUser.id);

    expect((await listTasks(testDb, teacherUser, {}, now)).map((t) => t.title).sort()).toEqual(["Подготовить пробник", "Проверить ДЗ"]);
    const all = await listTasks(testDb, admin, {}, now);
    expect(all).toHaveLength(3);
    expect(all.find((t) => t.title === "Позвонить маме Миши")?.display).toBe("overdue");
    expect(await overdueCount(testDb, ctx.admin.id, now)).toBe(1);

    await addTaskComment(testDb, teacherUser, mine.id, "Взяла вариант 2025 года");
    await setTaskStatus(testDb, teacherUser, mine.id, "DONE");
    const done = (await listTasks(testDb, admin, {}, now)).find((t) => t.id === mine.id)!;
    expect(done).toMatchObject({ display: "done", comments: 1 });
  });
});

describe("автозадачи", () => {
  it("урок не отмечен через 2 ч — задача педагогу; отметили — закрылась", async () => {
    const id = await lessonAt(ctx.monthly.id, "2026-10-12"); // 16:00–17:00 = 06:00–07:00Z
    expect((await unmarkedLessonTasks(testDb, new Date("2026-10-12T08:30:00Z"))).created).toBe(0); // 1,5 ч
    expect((await unmarkedLessonTasks(testDb, new Date("2026-10-12T09:01:00Z"))).created).toBe(1);
    expect((await unmarkedLessonTasks(testDb, new Date("2026-10-12T10:00:00Z"))).created).toBe(0); // без дублей
    const task = await testDb.task.findFirstOrThrow({ where: { lessonId: id } });
    expect(task).toMatchObject({ assigneeId: teacherUser.id, title: "Отметить урок 12.10 16:00: Иванов Миша" });

    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });
    await unmarkedLessonTasks(testDb, new Date("2026-10-12T11:00:00Z"));
    expect((await testDb.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  });

  it("лид без касания больше 2 дней — задача ответственному; касание закрывает", async () => {
    const lead = await createLead(testDb, ctx.admin.id, { childName: "Петя", phone: "+7 900 111-22-33", source: "AVITO" });
    await testDb.lead.update({ where: { id: lead.id }, data: { createdAt: new Date("2026-10-01T00:00:00Z") } });
    expect((await idleLeadTasks(testDb, new Date("2026-10-05T00:00:00Z"))).created).toBe(1);
    const task = await testDb.task.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(task).toMatchObject({ title: "Перезвонить лиду: Петя", assigneeId: ctx.admin.id });
    await addLeadTouch(testDb, ctx.admin.id, lead.id, "call", "Договорились о пробном");
    await idleLeadTasks(testDb, new Date());
    expect((await testDb.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  });

  it("поурочник в минусе больше суток — «Напомнить об оплате»; оплатил — задача закрыта", async () => {
    const id = await lessonAt(ctx.perLesson.id, "2026-10-12");
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await testDb.ledgerEntry.updateMany({ data: { createdAt: new Date("2026-10-10T00:00:00Z") } });
    expect((await debtTasks(testDb, new Date("2026-10-12T00:00:00Z"))).created).toBe(1);
    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 1700, method: "SBP" });
    await debtTasks(testDb, new Date("2026-10-12T01:00:00Z"));
    expect((await testDb.task.findFirstOrThrow({ where: { type: "debt" } })).status).toBe("DONE");
  });

  it("абонементщику в минусе отдельная задача о долге не ставится", async () => {
    await testDb.ledgerEntry.create({ data: { clientId: ctx.monthly.id, type: "ADJUSTMENT", amount: -5000, createdAt: new Date("2026-10-01T00:00:00Z") } });
    expect((await debtTasks(testDb, new Date("2026-10-12T00:00:00Z"))).created).toBe(0);
  });
});

describe("лиды: от заявки до клиента", () => {
  it("заявка → касание → пробный (бесплатно, педагогу 500) → предложение → клиент", async () => {
    const lead = await createLead(testDb, ctx.admin.id, {
      childName: "Козлова Вера",
      parentName: "Козлова Ирина Петровна",
      phone: "+7 914 222-33-44",
      source: "SITE",
      subject: "математика",
      program: "EXAM",
      grade: 9,
    });
    await addLeadTouch(testDb, ctx.admin.id, lead.id, "call", "Хотят ОГЭ на 5");
    expect((await testDb.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONTACTED");

    const r = await scheduleTrial(testDb, ctx.admin.id, lead.id, { teacherId: ctx.teacher.id, date: "2026-10-14", time: "12:00", durationMin: 60, subject: "математика" });
    expect(r.ok).toBe(true);
    const l = await testDb.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { trialLesson: true } });
    expect(l.stage).toBe("TRIAL_SCHEDULED");
    expect(l.trialLesson).toMatchObject({ isTrial: true, clientId: null, onlineUrl: "https://meet.test/petrova" });

    await settle(testDb, ctx.actor, l.trialLessonId!, { kind: "DONE", attendance: {} });
    expect((await testDb.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("TRIAL_DONE");
    expect((await testDb.teacherAccrual.findUniqueOrThrow({ where: { lessonId: l.trialLessonId! } })).amount).toBe(500);
    expect(await testDb.ledgerEntry.count()).toBe(0); // для ученика бесплатно

    const offer = await leadOffer(testDb, lead.id, [{ weekday: 2, durationMin: 60 }, { weekday: 5, durationMin: 60 }], "2026-10-14");
    expect(offer).toMatchObject({ lessonsCount: 8, amount: 12000, perLessonAmount: 13600 }); // ноябрь
    expect(offer.text).toContain("Здравствуйте, Ирина Петровна!");

    const { clientId } = await convertLead(testDb, ctx.admin.id, lead.id, {
      fullName: "Козлова Вера",
      gender: "FEMALE",
      grade: 9,
      program: "EXAM",
      paymentMode: "MONTHLY",
      parentName: "Козлова Ирина Петровна",
      parentPhone: "+7 914 222-33-44",
    });
    const client = await testDb.client.findUniqueOrThrow({ where: { id: clientId }, include: { parents: true, lessons: true } });
    expect(client.parents[0].fullName).toBe("Козлова Ирина Петровна");
    expect(client.lessons.map((x) => x.isTrial)).toEqual([true]); // пробный урок теперь в истории ученика
    expect((await testDb.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("WON");
    await expect(convertLead(testDb, ctx.admin.id, lead.id, { fullName: "Козлова Вера", gender: null, grade: 9, program: "EXAM", paymentMode: "MONTHLY", parentName: "x", parentPhone: "+7 900 000" })).rejects.toThrow(/уже переведён/);

    const stats = await leadStats(testDb, "2026-01-01", "2030-12-31");
    expect(stats.total).toMatchObject({ total: 1, won: 1, conversion: 100 });
  });

  it("отказ — только с причиной; не пришёл на пробный — отмена без денег", async () => {
    const lead = await createLead(testDb, ctx.admin.id, { childName: "Лёша", phone: "+7 900 333-44-55", source: "VK" });
    await scheduleTrial(testDb, ctx.admin.id, lead.id, { teacherId: ctx.teacher.id, date: "2026-10-14", time: "12:00", durationMin: 60, subject: "информатика" });
    const { trialLessonId } = await testDb.lead.findUniqueOrThrow({ where: { id: lead.id } });
    await cancelLesson(testDb, ctx.actor, trialLessonId!, { by: "CLIENT", notifiedAt: new Date("2026-10-14T03:30:00Z") });
    expect((await testDb.lesson.findUniqueOrThrow({ where: { id: trialLessonId! } })).status).toBe("CANCELLED");
    expect(await testDb.teacherAccrual.count()).toBe(0);

    await expect(setLeadStage(testDb, ctx.admin.id, lead.id, "LOST")).rejects.toThrow(/причину/);
    await setLeadStage(testDb, ctx.admin.id, lead.id, "LOST", "Не подошло время");
    expect(await testDb.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ stage: "LOST", lostReason: "Не подошло время" });
  });

  it("пробный в занятое время педагога — конфликт", async () => {
    await lessonAt(ctx.monthly.id, "2026-10-14", "12:00");
    const lead = await createLead(testDb, ctx.admin.id, { childName: "Оля", phone: "+7 900 444-55-66", source: "REFERRAL" });
    const r = await scheduleTrial(testDb, ctx.admin.id, lead.id, { teacherId: ctx.teacher.id, date: "2026-10-14", time: "12:30", durationMin: 60, subject: "математика" });
    expect(r.ok).toBe(false);
  });
});

describe("расходы и отчёты", () => {
  it("расходы: итог по статьям, отменённые не считаются", async () => {
    await addExpense(testDb, ctx.admin.id, { category: "Аренда", amount: 30000, date: "2026-10-01" });
    const ads = await addExpense(testDb, ctx.admin.id, { category: "Реклама", amount: 5000, date: "2026-10-05" });
    await addExpense(testDb, ctx.admin.id, { category: "Реклама", amount: 2000, date: "2026-10-06" });
    await cancelExpense(testDb, ctx.admin.id, ads.id, "задвоили");
    const e = await listExpenses(testDb, "2026-10-01", "2026-10-31");
    expect(e.total).toBe(32000);
    expect(e.byCategory).toEqual([
      { category: "Аренда", amount: 30000 },
      { category: "Реклама", amount: 2000 },
    ]);
  });

  it("прибыль = выручка − зарплаты − расходы; поступления отдельно; уважительный пропуск не выручка", async () => {
    const a = await lessonAt(ctx.perLesson.id, "2026-10-12", "10:00", 90); // 1,5 × 1 700 = 2 550; педагогу 1 050
    const b = await lessonAt(ctx.monthly.id, "2026-10-13", "10:00", 60); // абонемент 1 500; педагогу 700
    const c = await lessonAt(ctx.monthly.id, "2026-10-14", "10:00", 60); // отмена клиентом заранее
    await settle(testDb, ctx.actor, a, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await settle(testDb, ctx.actor, b, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });
    await cancelLesson(testDb, ctx.actor, c, { by: "CLIENT", excused: true });
    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 2000, method: "CASH", paidAt: new Date("2026-10-12T05:00:00Z") });
    await addExpense(testDb, ctx.admin.id, { category: "Аренда", amount: 1000, date: "2026-10-10" });

    const week = await financials(testDb, { from: "2026-10-12", to: "2026-10-18" });
    expect(week).toMatchObject({ receipts: 2000, revenue: 4050, salaries: 1750, expenses: 0, profit: 2300, bonusIncluded: false });
    const month = await financials(testDb, { from: "2026-10-01", to: "2026-10-31" });
    expect(month).toMatchObject({ revenue: 4050, salaries: 1750, expenses: 1000, profit: 1300, bonusIncluded: true });

    const att = await attendanceStats(testDb, { from: "2026-10-12", to: "2026-10-18" });
    expect(att.counts).toMatchObject({ done: 2, excused: 1 });
    expect(await balanceOf(ctx.perLesson.id)).toBe(-550);
  });
});
