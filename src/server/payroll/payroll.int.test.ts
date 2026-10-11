import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "@/domain/calendar";
import { resetDb, seedBasics, testDb } from "@/test/db";
import { payrollPayoutTask } from "../jobs";
import { createLessons, settle } from "../lessons/service";
import { addPayrollAdjustment, addPayrollPayment, cancelPayrollPayment, closePayrollMonth, teacherMonth } from "./payroll";
import { assignPlan, listPlans, revisePlan } from "./rates";
import { acceptInvite, createTeacher, inviteInfo } from "./teachers";

let ctx: Awaited<ReturnType<typeof seedBasics>>;
let planId: string;

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  const plan = await testDb.ratePlan.findFirstOrThrow();
  planId = plan.id;
  await testDb.ratePlan.update({ where: { id: plan.id }, data: { familyId: plan.id, versionFrom: toDbDate("2026-01-01") } });
  await testDb.teacherRatePlan.create({ data: { teacherId: ctx.teacher.id, planId, validFrom: toDbDate("2026-01-01") } });
  await testDb.user.create({ data: { email: "owner@test", name: "Владелец", role: "OWNER", passwordHash: "x" } });
});
afterAll(() => testDb.$disconnect());

/** Индивидуальные уроки Петровой по пн/ср/пт в октябре 2026, durationMin — длительность. */
async function octoberLessons(durationMin = 60) {
  const r = await createLessons(
    testDb,
    ctx.actor,
    {
      teacherId: ctx.teacher.id,
      clientId: ctx.monthly.id,
      subject: "математика",
      date: "2026-10-01",
      time: "16:00",
      durationMin,
      repeat: { kind: "weekly", weekdays: [1, 3, 5], until: "2026-10-31" },
    },
    "2026-10-01",
  );
  if (!r.ok) throw new Error("не созданы");
  return testDb.lesson.findMany({ where: { teacherId: ctx.teacher.id }, orderBy: { startsAt: "asc" } });
}

const markAll = async (lessons: { id: string }[]) => {
  for (const l of lessons) await settle(testDb, ctx.actor, l.id, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });
};

describe("ведомость месяца", () => {
  it("начислено по проведённым, прогноз — с запланированными, шкала до надбавки", async () => {
    const lessons = await octoberLessons(90); // 13 уроков (пн 4 + ср 4 + пт 5) × 1,5 ч = 19,5 ч
    expect(lessons).toHaveLength(13);
    await markAll(lessons.slice(0, 6)); // 9 ч проведено

    const m = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-10-14");
    expect(m.actual).toMatchObject({ hours: 9, baseAmount: 6300, bonusAmount: 0, total: 6300 });
    expect(m.forecast).toMatchObject({ hours: 19.5, total: 13650 });
    expect(m.plannedCount).toBe(7);
    expect(m.progress.next).toMatchObject({ thresholdHours: 30, hoursLeft: 21 });
    expect(m.lessons).toHaveLength(6);
    expect(m.lessons[0]).toMatchObject({ amount: 1050, basis: "1,5 ч × 700 ₽" });
  });

  it("36 ч — +10% ко всей сумме (контрольный пример): 27 720", async () => {
    // 36 часовых уроков в октябре: каждый день по одному уроку с 01.10 и ещё 5 вечерних.
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-01", time: "10:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7], until: "2026-10-31" } },
      "2026-10-01",
    );
    expect(r.ok).toBe(true);
    const r2 = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-01", time: "18:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [4], until: "2026-10-31" } },
      "2026-10-01",
    );
    expect(r2.ok).toBe(true);
    const lessons = await testDb.lesson.findMany({ where: { teacherId: ctx.teacher.id } });
    expect(lessons).toHaveLength(36); // 31 + 5 четвергов
    await markAll(lessons);
    const m = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-11-02");
    expect(m.actual).toMatchObject({ hours: 36, baseAmount: 25200, bonusPercent: 10, total: 27720 });
  });

  it("премия, штраф, аванс → к выплате; закрытие фиксирует сумму; выплата → «выплачено»", async () => {
    const lessons = await octoberLessons(60); // 13 ч
    await markAll(lessons);
    await addPayrollAdjustment(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, 1000, "за подготовку к олимпиаде");
    await addPayrollAdjustment(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, -300, "опоздание");
    await addPayrollPayment(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, { amount: 5000, paidAt: new Date(), isAdvance: true }, "2026-10-20");

    let m = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-10-31");
    expect(m.totals).toEqual({ earned: 9100, adjustments: 700, total: 9800, paid: 5000, toPay: 4800 });
    await expect(closePayrollMonth(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, "2026-10-31")).rejects.toThrow(/завершившийся/);

    const closed = await closePayrollMonth(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, "2026-11-05");
    expect(closed).toMatchObject({ total: 9800, unmarked: 0 });
    await expect(addPayrollAdjustment(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, 100, "ещё")).rejects.toThrow(/закрыт/);

    await addPayrollPayment(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, { amount: 4800, paidAt: new Date(), isAdvance: false }, "2026-11-05");
    m = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-11-05");
    expect(m.status).toBe("PAID");
    expect(m.totals.toPay).toBe(0);

    // Ошибочная выплата отменяется — снова «закрыт», к выплате 4 800.
    const pay = m.payments.find((p) => !p.isAdvance)!;
    await cancelPayrollPayment(testDb, ctx.admin.id, pay.id, "ошиблись суммой", "2026-11-05");
    m = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-11-05");
    expect(m.status).toBe("CLOSED");
    expect(m.totals.toPay).toBe(4800);
  });

  it("исправили отметку после закрытия — разница переносится в текущий месяц строкой перерасчёта", async () => {
    const lessons = await octoberLessons(60);
    await markAll(lessons);
    await closePayrollMonth(testDb, ctx.admin.id, ctx.teacher.id, 2026, 10, "2026-11-03");

    await settle(testDb, ctx.actor, lessons[0].id, { kind: "PLANNED" }); // сняли отметку с урока октября
    let nov = await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-11-10");
    expect(nov.adjustments).toEqual([expect.objectContaining({ kind: "RECALC", amount: -700 })]);

    // Октябрь не изменился.
    const oct = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-11-10");
    expect(oct.totals.earned).toBe(9100);

    // Вернули отметку — перерасчёт исчезает, повторный просмотр не задваивает.
    await settle(testDb, ctx.actor, lessons[0].id, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });
    nov = await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-11-10");
    nov = await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-11-10");
    expect(nov.adjustments).toEqual([]);
  });
});

describe("ставки", () => {
  it("изменение шаблона действует с 1-го числа следующего месяца, текущий месяц — по старой ставке", async () => {
    const lessons = await octoberLessons(60);
    await markAll(lessons.slice(0, 2));
    await revisePlan(
      testDb,
      ctx.admin.id,
      planId,
      { name: "Шаблон", baseAmount: 800, groupPerStudent: 100, trialFixed: 500, payForUnexcused: false, bonusApply: "WHOLE_MONTH", tiers: [{ thresholdHours: 30, bonusPercent: 10 }] },
      "2026-10-14",
    );
    const oct = await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-10-14");
    expect(oct.plan.baseAmount).toBe(700);
    expect(oct.forecast.total).toBe(13 * 700);
    const nov = await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-10-14");
    expect(nov.plan.baseAmount).toBe(800);

    const plans = await listPlans(testDb, "2026-10-14");
    expect(plans).toHaveLength(1); // старая версия скрыта
    expect(plans[0]).toMatchObject({ baseAmount: 800, versionFrom: "2026-11-01", teachers: 1 });

    // Повторная правка до вступления в силу — меняет ту же версию, а не плодит новые.
    await revisePlan(testDb, ctx.admin.id, plans[0].id, { ...plans[0], baseAmount: 750 }, "2026-10-20");
    expect(await testDb.ratePlan.count()).toBe(2);
    expect((await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-10-20")).plan.baseAmount).toBe(750);
  });

  it("индивидуальный план — только с 1-го числа следующего месяца", async () => {
    const vip = await testDb.ratePlan.create({ data: { name: "Ведущий педагог", baseAmount: 900 } });
    await expect(assignPlan(testDb, ctx.admin.id, ctx.teacher.id, vip.id, "2026-10-01", "2026-10-14")).rejects.toThrow(/следующего месяца/);
    await assignPlan(testDb, ctx.admin.id, ctx.teacher.id, vip.id, "2026-11-15", "2026-10-14");
    expect((await teacherMonth(testDb, ctx.teacher.id, 2026, 11, "2026-10-14")).plan.baseAmount).toBe(900);
    expect((await teacherMonth(testDb, ctx.teacher.id, 2026, 10, "2026-10-14")).plan.baseAmount).toBe(700);
  });
});

describe("педагоги и приглашения", () => {
  it("новый педагог: ставка школы с текущего месяца, ссылка-приглашение, пароль задаётся один раз", async () => {
    const r = await createTeacher(
      testDb,
      ctx.admin.id,
      { fullName: "Смирнов Олег", email: "Smirnov@Lidd.School", color: "#8A88EE", subjects: ["математика"] },
      "2026-10-14",
    );
    expect(r.inviteLink).toMatch(/\/invite\/[\w-]+$/);
    const token = r.inviteLink!.split("/").pop()!;
    expect(await inviteInfo(testDb, token)).toEqual({ email: "smirnov@lidd.school", name: "Смирнов Олег" });
    expect((await teacherMonth(testDb, r.teacherId, 2026, 10, "2026-10-14")).plan.baseAmount).toBe(700);

    await expect(acceptInvite(testDb, token, "123")).rejects.toThrow(/8 символов/);
    await acceptInvite(testDb, token, "новый-пароль-1");
    expect(await inviteInfo(testDb, token)).toBeNull();
    await expect(acceptInvite(testDb, token, "ещё-один-пароль")).rejects.toThrow(/недействительна/);
  });

  it("email занят — ошибка", async () => {
    await expect(
      createTeacher(testDb, ctx.admin.id, { fullName: "Двойник", email: "admin@test", color: "#000000", subjects: [] }, "2026-10-14"),
    ).rejects.toThrow(/уже есть/);
  });
});

describe("автозадача выплаты", () => {
  it("5-го числа — владельцу «Выплатить зарплаты за …», один раз", async () => {
    await markAll((await octoberLessons(60)).slice(0, 1));
    expect(await payrollPayoutTask(testDb, "2026-11-05")).toBe(true);
    await payrollPayoutTask(testDb, "2026-11-06");
    const tasks = await testDb.task.findMany({ where: { type: "payroll" }, include: { assignee: true } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Выплатить зарплаты за октябрь 2026");
    expect(tasks[0].assignee?.role).toBe("OWNER");
  });
});
