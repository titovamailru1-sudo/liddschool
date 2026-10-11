import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { balanceOf, resetDb, seedBasics, testDb } from "@/test/db";
import { runJobs, chargeDueInvoices, processOverdue } from "../jobs";
import { cancelLesson, createLessons, moveLesson } from "../lessons/service";
import { createTelegramInvite, deliverQueued, handleTelegramUpdate } from "../messaging/outbox";
import type { MessageSender } from "../messaging/telegram";
import { buildInvoiceDraft, issueInvoice } from "./invoices";
import { acceptPayment, adjustBalance, cancelPayment } from "./payments";
import { processPerLesson } from "./perLesson";

let ctx: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb();
  ctx = await seedBasics();
  await testDb.client.update({ where: { id: ctx.monthly.id }, data: { gender: "MALE" } });
  await testDb.parent.createMany({
    data: [
      { clientId: ctx.monthly.id, fullName: "Иванова Ольга Петровна", phone: "+7 900 000-00-01" },
      { clientId: ctx.perLesson.id, fullName: "Соколова Елена Викторовна", phone: "+7 900 000-00-02" },
    ],
  });
});
afterAll(() => testDb.$disconnect());

/** Миша (ЕГЭ, абонемент): по воскресеньям в 16:00 с 04.10.2026. */
async function sundaySeries(today = "2026-10-01") {
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
    today,
  );
  if (!r.ok) throw new Error("серия не создана");
}

const lessonAt = (iso: string) => testDb.lesson.findFirstOrThrow({ where: { startsAt: new Date(iso), clientId: ctx.monthly.id } });

class TestSender implements MessageSender {
  readonly kind = "fake" as const;
  sent: { chatId: string; text: string }[] = [];
  async send(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  }
}

describe("абонемент: полный цикл", () => {
  it("расписание → черновик → отправка → списание 1-го → оплата → баланс 0", async () => {
    await sundaySeries();
    const draft = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    expect(draft).toMatchObject({ ok: true, total: 7500 });
    const id = draft.ok ? draft.invoiceId : "";

    const inv = await testDb.monthlyInvoice.findUniqueOrThrow({ where: { id }, include: { items: true, paymentLinks: true } });
    expect(inv).toMatchObject({ lessonsCount: 5, amount: 7500, perLessonAmount: 8500, total: 7500, status: "DRAFT" });
    expect(inv.items).toHaveLength(5);
    expect(inv.messageText).toContain("Здравствуйте, Ольга Петровна! В ноябре у Миши Иванова 5 занятий по математике");
    expect(inv.messageText).toContain("Итого к оплате: 7 500 ₽ до 01.11.");
    expect(inv.messageText).toContain(`/pay/${inv.paymentLinks[0].token}`);

    // Пересчёт черновика не плодит строки.
    await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    expect(await testDb.invoiceItem.count({ where: { invoiceId: id } })).toBe(5);

    await issueInvoice(testDb, id, ctx.admin.id, "2026-10-26");
    expect(await testDb.message.count({ where: { invoiceId: id, kind: "invoice" } })).toBe(1);
    expect(await balanceOf(ctx.monthly.id)).toBe(0); // до 1-го не списываем

    expect(await chargeDueInvoices(testDb, "2026-11-01")).toBe(1);
    expect(await chargeDueInvoices(testDb, "2026-11-02")).toBe(0); // один раз
    expect(await balanceOf(ctx.monthly.id)).toBe(-7500);

    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.monthly.id, amount: 7500, method: "SBP", invoiceId: id });
    expect(await balanceOf(ctx.monthly.id)).toBe(0);
    expect((await testDb.monthlyInvoice.findUniqueOrThrow({ where: { id } })).status).toBe("PAID");
  });

  it("долг добавляется к итогу, но списывается только стоимость уроков", async () => {
    await sundaySeries();
    await adjustBalance(testDb, ctx.admin.id, { clientId: ctx.monthly.id, kind: "ADJUSTMENT", amount: -1700, comment: "долг за сентябрь" });
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    expect(d).toMatchObject({ ok: true, total: 9200 });
    await issueInvoice(testDb, d.ok ? d.invoiceId : "", ctx.admin.id, "2026-11-01"); // выставлен уже в месяце — списывается сразу
    expect(await balanceOf(ctx.monthly.id)).toBe(-9200);
  });

  it("оплата заранее «на баланс» — после списания счёт считается оплаченным", async () => {
    await sundaySeries();
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.monthly.id, amount: 7500, method: "CASH" });
    await issueInvoice(testDb, d.ok ? d.invoiceId : "", ctx.admin.id, "2026-10-27");
    await chargeDueInvoices(testDb, "2026-11-01");
    expect((await testDb.monthlyInvoice.findFirstOrThrow()).status).toBe("PAID");
  });

  it("выставленный счёт не пересчитывается", async () => {
    await sundaySeries();
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    await issueInvoice(testDb, d.ok ? d.invoiceId : "", ctx.admin.id, "2026-10-26");
    expect(await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11)).toEqual({ ok: false, reason: "счёт уже выставлен" });
  });

  it("ученик пришёл в середине месяца — счёт только на оставшиеся уроки", async () => {
    await sundaySeries();
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 10, { from: "2026-10-15" });
    expect(d).toMatchObject({ ok: true, total: 3000 }); // 18.10 и 25.10
  });
});

describe("перенос разницы в следующий месяц", () => {
  it("отмена школой — вычет; перенос внутри месяца — без вычета; перенос на ноябрь — не оплачивается дважды; добавленный урок — доплата", async () => {
    await sundaySeries();
    const oct = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 10);
    expect(oct).toMatchObject({ ok: true, total: 6000 }); // 4, 11, 18, 25 октября
    await issueInvoice(testDb, oct.ok ? oct.invoiceId : "", ctx.admin.id, "2026-10-01");

    // 11.10 — отменён школой без новой даты.
    await cancelLesson(testDb, ctx.actor, (await lessonAt("2026-10-11T06:00:00Z")).id, { by: "SCHOOL" });
    // 18.10 — педагог перенёс на 21.10 (тот же месяц).
    await moveLesson(testDb, ctx.actor, (await lessonAt("2026-10-18T06:00:00Z")).id, { date: "2026-10-21", time: "16:00" });
    // 25.10 — перенесён на 03.11.
    await moveLesson(testDb, ctx.actor, (await lessonAt("2026-10-25T06:00:00Z")).id, { date: "2026-11-03", time: "16:00" });
    // Дополнительный урок 28.10, добавленный после выставления счёта.
    await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.monthly.id, subject: "математика", date: "2026-10-28", time: "16:00", durationMin: 60, repeat: { kind: "once" } },
      "2026-10-01",
    );

    const nov = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    const inv = await testDb.monthlyInvoice.findUniqueOrThrow({
      where: { id: nov.ok ? nov.invoiceId : "" },
      include: { adjustments: true, items: true },
    });
    expect(inv.lessonsCount).toBe(5); // воскресенья ноября; перенесённый на 03.11 не входит
    expect(inv.amount).toBe(7500);
    expect(inv.adjustments.map((a) => [a.amount, a.reason]).sort()).toEqual(
      [
        [-1500, "урок 11.10 отменён школой"],
        [1500, "доплата за урок 28.10"],
      ].sort(),
    );
    expect(inv.adjustmentsTotal).toBe(0);
    expect(inv.messageText).toContain("Перерасчёт");

    // Повторный пересчёт черновика не задваивает корректировки.
    await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    expect(await testDb.invoiceAdjustment.count()).toBe(2);
  });
});

describe("поурочная оплата", () => {
  async function aliceLesson() {
    const r = await createLessons(
      testDb,
      ctx.actor,
      { teacherId: ctx.teacher.id, clientId: ctx.perLesson.id, subject: "информатика", date: "2026-10-20", time: "16:00", durationMin: 60, repeat: { kind: "once" } },
      "2026-10-01",
    );
    return r.ok ? r.value.lessonIds[0] : "";
  }

  it("за 48 ч — ссылка, за 24 ч — «под угрозой» и задача; оплатили — пометка и задача сняты", async () => {
    const lessonId = await aliceLesson(); // 20.10 16:00 = 06:00Z
    await processPerLesson(testDb, new Date("2026-10-18T04:00:00Z")); // за 50 ч — рано
    expect(await testDb.paymentLink.count()).toBe(0);

    await processPerLesson(testDb, new Date("2026-10-18T07:00:00Z")); // за 47 ч
    const link = await testDb.paymentLink.findFirstOrThrow({ where: { lessonId } });
    expect(link).toMatchObject({ amount: 1700, atRiskAt: null });
    expect(link.sentAt).not.toBeNull();
    const msg = await testDb.message.findFirstOrThrow({ where: { lessonId } });
    expect(msg.text).toContain("К оплате: 1 700 ₽ до 19.10.2026 16:00.");
    await processPerLesson(testDb, new Date("2026-10-18T08:00:00Z")); // повторно — без второй ссылки
    expect(await testDb.message.count({ where: { lessonId } })).toBe(1);

    await processPerLesson(testDb, new Date("2026-10-19T07:00:00Z")); // за 23 ч
    expect((await testDb.paymentLink.findFirstOrThrow({ where: { lessonId } })).atRiskAt).not.toBeNull();
    const task = await testDb.task.findFirstOrThrow({ where: { lessonId } });
    expect(task).toMatchObject({ isAuto: true, status: "NEW", assigneeId: ctx.admin.id });
    expect(task.title).toBe("Нет оплаты урока 20.10 16:00: Соколова Алиса");

    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 1700, method: "SBP", lessonId }, new Date("2026-10-19T08:00:00Z"));
    expect((await testDb.paymentLink.findFirstOrThrow({ where: { lessonId } })).atRiskAt).toBeNull();
    expect((await testDb.task.findFirstOrThrow({ where: { lessonId } })).status).toBe("DONE");
  });

  it("предоплата на балансе — ссылка не отправляется", async () => {
    await aliceLesson();
    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 5000, method: "CASH" });
    await processPerLesson(testDb, new Date("2026-10-19T07:00:00Z"));
    expect(await testDb.paymentLink.count()).toBe(0);
    expect(await testDb.task.count()).toBe(0);
  });
});

describe("платежи и корректировки", () => {
  it("ошибочный платёж отменяется сторно, причина обязательна", async () => {
    const { paymentId } = await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 3000, method: "CARD" });
    await expect(cancelPayment(testDb, ctx.admin.id, paymentId, " ")).rejects.toThrow(/причину/);
    await cancelPayment(testDb, ctx.admin.id, paymentId, "ошиблись клиентом");
    expect(await balanceOf(ctx.perLesson.id)).toBe(0);
    expect(await testDb.ledgerEntry.count()).toBe(2);
    expect((await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } })).cancelReason).toBe("ошиблись клиентом");
  });

  it("возврат уменьшает баланс; без комментария нельзя", async () => {
    await acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 3000, method: "CARD" });
    await expect(adjustBalance(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, kind: "REFUND", amount: 1000, comment: "" })).rejects.toThrow();
    const r = await adjustBalance(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, kind: "REFUND", amount: 1000, comment: "вернули за пропуск" });
    expect(r.balance).toBe(2000);
  });

  it("сумма должна быть положительной", async () => {
    await expect(acceptPayment(testDb, ctx.admin.id, { clientId: ctx.perLesson.id, amount: 0, method: "CASH" })).rejects.toThrow();
  });
});

describe("фоновые задачи и Telegram", () => {
  it("25-го черновики формируются один раз; просрочка 3-го — задача и одно напоминание", async () => {
    await sundaySeries();
    const sender = new TestSender();
    const first = await runJobs(testDb, new Date("2026-10-25T01:00:00Z"), sender); // 25.10 11:00 по Владивостоку
    expect(first.drafts).toMatchObject({ created: 1 });
    const again = await runJobs(testDb, new Date("2026-10-25T02:00:00Z"), sender);
    expect(again.drafts).toBe("already-done");

    const inv = await testDb.monthlyInvoice.findFirstOrThrow();
    await issueInvoice(testDb, inv.id, ctx.admin.id, "2026-10-26");
    await runJobs(testDb, new Date("2026-11-01T01:00:00Z"), sender);
    expect(await balanceOf(ctx.monthly.id)).toBe(-7500);

    await processOverdue(testDb, "2026-11-03");
    await processOverdue(testDb, "2026-11-04");
    expect(await testDb.task.count({ where: { autoKey: `invoice-overdue:${inv.id}` } })).toBe(1);
    expect(await testDb.message.count({ where: { invoiceId: inv.id, kind: "invoice_reminder" } })).toBe(1);
  });

  it("родитель без Telegram — сообщение «не отправлено» с причиной; после привязки по приглашению — доставлено", async () => {
    const sender = new TestSender();
    const parent = await testDb.parent.findFirstOrThrow({ where: { clientId: ctx.monthly.id } });
    await sundaySeries();
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    const { messageId } = await issueInvoice(testDb, d.ok ? d.invoiceId : "", ctx.admin.id, "2026-10-26");
    await deliverQueued(testDb, sender);
    expect(await testDb.message.findUniqueOrThrow({ where: { id: messageId } })).toMatchObject({
      status: "SKIPPED",
      error: "Родитель не подключил Telegram",
    });

    const invite = await createTelegramInvite(testDb, parent.id);
    await handleTelegramUpdate(testDb, sender, { update_id: 1, message: { chat: { id: 555 }, text: `/start ${invite.code}` } });
    expect((await testDb.parent.findUniqueOrThrow({ where: { id: parent.id } })).telegramChatId).toBe("555");
    expect(sender.sent.at(-1)?.text).toContain("Вы подключены к Lidd School");

    // Повторное использование кода — отказ.
    await handleTelegramUpdate(testDb, sender, { update_id: 2, message: { chat: { id: 777 }, text: `/start ${invite.code}` } });
    expect(sender.sent.at(-1)?.text).toContain("недействительна");

    await testDb.message.update({ where: { id: messageId }, data: { status: "QUEUED" } });
    await deliverQueued(testDb, sender);
    expect((await testDb.message.findUniqueOrThrow({ where: { id: messageId } })).status).toBe("SENT");
    expect(sender.sent.find((s) => s.chatId === "555" && s.text.includes("Абонемент на ноябрь"))).toBeTruthy();
  });

  it("без бота — сообщения помечаются «бот не настроен»", async () => {
    await sundaySeries();
    const d = await buildInvoiceDraft(testDb, ctx.monthly.id, 2026, 11);
    const { messageId } = await issueInvoice(testDb, d.ok ? d.invoiceId : "", ctx.admin.id, "2026-10-26");
    await deliverQueued(testDb, null);
    expect((await testDb.message.findUniqueOrThrow({ where: { id: messageId } })).error).toBe("Telegram-бот не настроен");
  });
});
