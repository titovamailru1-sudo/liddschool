import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { balanceOf, resetDb, seedBasics, testDb } from "@/test/db";
import { ensureLessons } from "./generation";
import { cancelLesson, createLessons, moveLesson, setSeriesEnd, settle, updateLessonNotes } from "./service";

const TODAY = "2026-10-11";
let ctx: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
});
afterAll(() => testDb.$disconnect());

async function oneLesson(clientId = ctx.perLesson.id, date = "2026-10-20", time = "16:00", durationMin = 90) {
  const r = await createLessons(
    testDb,
    ctx.actor,
    { teacherId: ctx.teacher.id, clientId, subject: "информатика", date, time, durationMin, repeat: { kind: "once" } },
    TODAY,
  );
  if (!r.ok) throw new Error("не создан");
  return r.value.lessonIds[0];
}

describe("создание", () => {
  it("разовый урок: онлайн, ссылка педагога, время по Владивостоку", async () => {
    const id = await oneLesson();
    const l = await testDb.lesson.findUniqueOrThrow({ where: { id } });
    expect(l.startsAt.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(l).toMatchObject({ format: "ONLINE", onlineUrl: "https://meet.test/petrova", program: "EXAM", status: "PLANNED" });
  });

  it("еженедельно вт + пт до 13.11: серии и уроки только в пределах срока", async () => {
    const r = await createLessons(
      testDb,
      ctx.actor,
      {
        teacherId: ctx.teacher.id,
        clientId: ctx.monthly.id,
        subject: "математика",
        date: "2026-10-13",
        time: "16:00",
        durationMin: 60,
        repeat: { kind: "weekly", weekdays: [2, 5], until: "2026-11-13" },
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    const lessons = await testDb.lesson.findMany({ where: { clientId: ctx.monthly.id }, orderBy: { startsAt: "asc" } });
    // вт 13,20,27.10, 3,10.11 + пт 16,23,30.10, 6,13.11
    expect(lessons).toHaveLength(10);
    expect(lessons.at(-1)!.startsAt.toISOString()).toBe("2026-11-13T06:00:00.000Z");
  });

  it("бессрочная серия создаётся до конца следующего месяца, дальше — при просмотре календаря", async () => {
    await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-12", time: "10:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [1], until: null } },
      TODAY,
    );
    expect(await testDb.lesson.count()).toBe(8); // пн 12.10 … 30.11
    await ensureLessons(testDb, "2026-12-01", "2026-12-31");
    expect(await testDb.lesson.count()).toBe(12);
    await ensureLessons(testDb, "2026-12-01", "2026-12-31"); // повторно — без дублей
    expect(await testDb.lesson.count()).toBe(12);
  });

  it("педагог занят — создать нельзя", async () => {
    await oneLesson();
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-20", time: "17:00", durationMin: 60, repeat: { kind: "once" } },
      TODAY,
    );
    expect(r).toMatchObject({ ok: false, blocking: true });
    expect(await testDb.lesson.count()).toBe(1);
  });

  it("ученик занят у другого педагога — нужно подтверждение, с force сохраняется", async () => {
    await oneLesson();
    const input = {
      teacherId: ctx.teacher2.id,
      clientId: ctx.perLesson.id,
      subject: "математика",
      date: "2026-10-20",
      time: "16:30",
      durationMin: 60,
      repeat: { kind: "once" as const },
    };
    expect(await createLessons(testDb, ctx.actor, input, TODAY)).toMatchObject({ ok: false, blocking: false });
    const forced = await createLessons(testDb, ctx.actor, { ...input, force: true }, TODAY);
    expect(forced.ok).toBe(true);
    expect(forced.ok && forced.warnings[0].kind).toBe("client");
  });
});

describe("отметка и деньги", () => {
  it("поурочник: проведён → списание 2 550 и начисление 1 050; повторная отметка ничего не дублирует", async () => {
    const id = await oneLesson();
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    expect(await balanceOf(ctx.perLesson.id)).toBe(-2550);
    expect(await testDb.ledgerEntry.count()).toBe(1);
    const acc = await testDb.teacherAccrual.findUniqueOrThrow({ where: { lessonId: id } });
    expect(acc).toMatchObject({ amount: 1050, hourlyAmount: 1050, extraAmount: 0 });
    expect(Number(acc.hours)).toBe(1.5);
    const l = await testDb.lesson.findUniqueOrThrow({ where: { id } });
    expect(l.markedById).toBe(ctx.admin.id);
  });

  it("исправление отметки: проведён → отменён школой → сторно, баланс 0, начисление удалено", async () => {
    const id = await oneLesson();
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await cancelLesson(testDb, ctx.actor, id, { by: "SCHOOL", reason: "болеет педагог" });
    expect(await balanceOf(ctx.perLesson.id)).toBe(0);
    const entries = await testDb.ledgerEntry.findMany({ orderBy: { createdAt: "asc" } });
    expect(entries.map((e) => e.amount)).toEqual([-2550, 2550]);
    expect(entries[1].reversalOfId).toBe(entries[0].id);
    expect(await testDb.teacherAccrual.count()).toBe(0);
    const l = await testDb.lesson.findUniqueOrThrow({ where: { id } });
    expect(l).toMatchObject({ status: "CANCELLED", cancelledBy: "SCHOOL", cancelReason: "болеет педагог" });
  });

  it("снять отметку — всё возвращается к запланированному", async () => {
    const id = await oneLesson();
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await settle(testDb, ctx.actor, id, { kind: "PLANNED" });
    expect(await balanceOf(ctx.perLesson.id)).toBe(0);
    expect(await testDb.attendance.count()).toBe(0);
    expect((await testDb.lesson.findUniqueOrThrow({ where: { id } })).markedAt).toBeNull();
  });

  it("абонементщик: при отметке деньги не двигаются", async () => {
    const id = await oneLesson(ctx.monthly.id);
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });
    expect(await testDb.ledgerEntry.count()).toBe(0);
    const att = await testDb.attendance.findFirstOrThrow({ where: { lessonId: id } });
    expect(att).toMatchObject({ price: 2250, paymentMode: "MONTHLY" });
  });

  it("отмена клиентом за 2 ч — неуважительный пропуск: списание, педагогу 0", async () => {
    const id = await oneLesson();
    await cancelLesson(testDb, ctx.actor, id, { by: "CLIENT", notifiedAt: new Date("2026-10-20T04:00:00Z") });
    const l = await testDb.lesson.findUniqueOrThrow({ where: { id }, include: { attendances: true } });
    expect(l.status).toBe("DONE");
    expect(l.attendances[0].status).toBe("ABSENT_UNEXCUSED");
    expect(await balanceOf(ctx.perLesson.id)).toBe(-2550);
    expect(await testDb.teacherAccrual.count()).toBe(0);
  });

  it("отмена клиентом за сутки — уважительный пропуск без денег; администратор может переквалифицировать", async () => {
    const id = await oneLesson();
    await cancelLesson(testDb, ctx.actor, id, { by: "CLIENT", notifiedAt: new Date("2026-10-18T06:00:00Z") });
    let l = await testDb.lesson.findUniqueOrThrow({ where: { id } });
    expect(l).toMatchObject({ status: "CANCELLED", cancelledBy: "CLIENT" });
    expect(await balanceOf(ctx.perLesson.id)).toBe(0);
    await cancelLesson(testDb, ctx.actor, id, { by: "CLIENT", excused: false });
    l = await testDb.lesson.findUniqueOrThrow({ where: { id } });
    expect(l.status).toBe("DONE");
    expect(await balanceOf(ctx.perLesson.id)).toBe(-2550);
  });

  it("групповой урок: посещаемость участников, групповые тарифы, доплата педагогу", async () => {
    const group = await testDb.group.create({
      data: {
        name: "ОГЭ-9А",
        subject: "математика",
        program: "EXAM",
        teacherId: ctx.teacher.id,
        members: {
          create: [
            { clientId: ctx.perLesson.id, joinedAt: new Date("2026-10-01T00:00:00Z") },
            { clientId: ctx.monthly.id, joinedAt: new Date("2026-10-01T00:00:00Z") },
          ],
        },
      },
    });
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, groupId: group.id, subject: "математика", date: "2026-10-17", time: "10:00", durationMin: 90, repeat: { kind: "once" } },
      TODAY,
    );
    const id = r.ok ? r.value.lessonIds[0] : "";
    await settle(testDb, ctx.actor, id, {
      kind: "DONE",
      attendance: { [ctx.perLesson.id]: "PRESENT", [ctx.monthly.id]: "ABSENT_EXCUSED" },
    });
    expect(await balanceOf(ctx.perLesson.id)).toBe(-1500); // 1,5 × 1 000
    const acc = await testDb.teacherAccrual.findUniqueOrThrow({ where: { lessonId: id } });
    expect(acc).toMatchObject({ amount: 1150, hourlyAmount: 1050, extraAmount: 100 });
  });
});

describe("перенос", () => {
  it("старый урок — «перенесён» со ссылкой, новый — запланирован; повторная генерация не возвращает старый слот", async () => {
    await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-13", time: "16:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [2], until: "2026-10-27" } },
      TODAY,
    );
    const first = await testDb.lesson.findFirstOrThrow({ orderBy: { startsAt: "asc" } });
    await updateLessonNotes(testDb, ctx.actor, first.id, { topic: "Квадратные уравнения" });
    const r = await moveLesson(testDb, ctx.actor, first.id, { date: "2026-10-14", time: "18:00", teacherId: ctx.teacher2.id });
    expect(r.ok).toBe(true);
    const old = await testDb.lesson.findUniqueOrThrow({ where: { id: first.id } });
    const neu = await testDb.lesson.findUniqueOrThrow({ where: { id: old.movedToId! } });
    expect(old.status).toBe("MOVED");
    expect(neu).toMatchObject({ status: "PLANNED", teacherId: ctx.teacher2.id, topic: "Квадратные уравнения", seriesId: null });
    expect(neu.startsAt.toISOString()).toBe("2026-10-14T08:00:00.000Z");
    await ensureLessons(testDb, "2026-10-01", "2026-10-31");
    expect(await testDb.lesson.count()).toBe(4); // 3 из серии (один перенесён) + новый
  });

  it("проведённый урок перенести нельзя", async () => {
    const id = await oneLesson();
    await settle(testDb, ctx.actor, id, { kind: "DONE", attendance: { [ctx.perLesson.id]: "PRESENT" } });
    await expect(moveLesson(testDb, ctx.actor, id, { date: "2026-10-21", time: "16:00" })).rejects.toThrow(/только запланированный/);
  });
});

describe("срок действия расписания", () => {
  it("сокращение срока удаляет только будущие запланированные уроки; продление досоздаёт", async () => {
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-12", time: "16:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [1], until: null } },
      TODAY,
    );
    const seriesId = r.ok ? r.value.seriesIds[0] : "";
    const first = await testDb.lesson.findFirstOrThrow({ orderBy: { startsAt: "asc" } });
    await settle(testDb, ctx.actor, first.id, { kind: "DONE", attendance: { [ctx.monthly.id]: "PRESENT" } });

    const cut = await setSeriesEnd(testDb, ctx.actor, seriesId, "2026-10-19", TODAY);
    expect(cut.removed).toBe(6); // 26.10 … 30.11
    expect(await testDb.lesson.count()).toBe(2);

    const ext = await setSeriesEnd(testDb, ctx.actor, seriesId, null, TODAY);
    expect(ext.created).toBe(6);
    expect((await testDb.lesson.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("DONE");
  });

  it("дата окончания раньше начала — ошибка", async () => {
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-12", time: "16:00", durationMin: 60, repeat: { kind: "weekly", weekdays: [1], until: null } },
      TODAY,
    );
    await expect(setSeriesEnd(testDb, ctx.actor, r.ok ? r.value.seriesIds[0] : "", "2026-10-01", TODAY)).rejects.toThrow();
  });
});
