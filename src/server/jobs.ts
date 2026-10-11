import { invoiceTarget, monthKey, renderInvoiceReminder } from "@/domain/billing";
import { firstOfMonth, localDateOf, parseLocalDate, startOfDay, toDbDate } from "@/domain/calendar";
import { monthName } from "@/domain/format";
import { greetingName, studentNameGenitive } from "@/domain/names";
import { Prisma } from "@prisma/client";
import { chargeInvoice, generateDrafts, refreshInvoiceStatus } from "./billing/invoices";
import { processPerLesson } from "./billing/perLesson";
import { appUrl, loadSettings } from "./billing/settings";
import { ensureAutoTask } from "./billing/tasks";
import { debtTasks, idleLeadTasks, unmarkedLessonTasks } from "./tasks/auto";
import type { Db } from "./lessons/context";
import { deliverQueued, queueMessage } from "./messaging/outbox";
import type { MessageSender } from "./messaging/telegram";

type RootDb = Extract<Db, { $transaction: unknown }>;

/** Выполнить задачу периода один раз: ключ в JobRun захватывается до начала работы. */
async function once<T>(db: Db, key: string, fn: () => Promise<T>): Promise<T | "already-done"> {
  try {
    await db.jobRun.create({ data: { key } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "already-done";
    throw e;
  }
  const result = await fn();
  await db.jobRun.update({ where: { key }, data: { finishedAt: new Date(), result: JSON.parse(JSON.stringify(result ?? null)) } });
  return result;
}

/** Списать выставленные счета, у которых наступил месяц оплаты. */
export async function chargeDueInvoices(db: RootDb, today: string) {
  const due = await db.monthlyInvoice.findMany({
    where: { chargedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] }, month: { lte: toDbDate(today) } },
    select: { id: true },
  });
  let charged = 0;
  for (const i of due) {
    if (await chargeInvoice(db, i.id, today)) charged++;
    await refreshInvoiceStatus(db, i.id);
  }
  return charged;
}

/** С 3-го числа: неоплаченные счета текущего месяца — задача администратору и одно напоминание родителю. */
export async function processOverdue(db: RootDb, today: string) {
  const { year, month } = parseLocalDate(today);
  const invoices = await db.monthlyInvoice.findMany({
    where: { month: toDbDate(firstOfMonth(year, month)), chargedAt: { not: null }, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] } },
    include: { client: { include: { parents: { orderBy: [{ isPrimary: "desc" }], take: 1 } } }, paymentLinks: true },
  });
  let overdue = 0;
  for (const inv of invoices) {
    const fresh = await refreshInvoiceStatus(db, inv.id);
    if (fresh?.status === "PAID") continue;
    overdue++;
    await ensureAutoTask(db, {
      autoKey: `invoice-overdue:${inv.id}`,
      title: `Не оплачен абонемент: ${inv.client.fullName}`,
      type: "subscription",
      clientId: inv.clientId,
    });
    const reminded = await db.message.count({ where: { invoiceId: inv.id, kind: "invoice_reminder" } });
    if (!reminded) {
      const parent = inv.client.parents[0];
      const token = inv.paymentLinks[0]?.token;
      await queueMessage(db, {
        clientId: inv.clientId,
        kind: "invoice_reminder",
        invoiceId: inv.id,
        text: renderInvoiceReminder({
          parentName: parent ? greetingName(parent.fullName) : "",
          studentNameGen: studentNameGenitive(inv.client.fullName, inv.client.gender, inv.client.fullNameGen),
          monthName: monthName(month),
          amount: inv.total,
          payUrl: token ? `${appUrl()}/pay/${token}` : appUrl(),
        }).replace("Здравствуйте, ! ", "Здравствуйте! "),
      });
    }
  }
  return overdue;
}

/** 5-го числа — задача владельцу выплатить зарплаты за прошлый месяц (если были начисления). */
export async function payrollPayoutTask(db: RootDb, today: string) {
  const { year, month } = parseLocalDate(today);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const from = firstOfMonth(prev.year, prev.month);
  const accruals = await db.teacherAccrual.count({
    where: { lesson: { startsAt: { gte: startOfDay(from), lt: startOfDay(firstOfMonth(year, month)) } } },
  });
  if (!accruals) return false;
  await ensureAutoTask(db, {
    autoKey: `payroll-payout:${monthKey(prev.year, prev.month)}`,
    title: `Выплатить зарплаты за ${monthName(prev.month)} ${prev.year}`,
    description: "Финансы → Зарплаты: закрыть месяц и отметить выплаты.",
    type: "payroll",
    assignTo: "OWNER",
  });
  return true;
}

/**
 * Все фоновые задачи. Безопасно запускать сколько угодно раз (раз в минуту из воркера или кнопкой):
 * - с 25-го — черновики счетов на следующий месяц (один раз за месяц; отправляет администратор);
 * - списание выставленных счетов в месяц оплаты;
 * - с 3-го — просрочка: задача и напоминание;
 * - поурочники: ссылки за 48 ч, «под угрозой» за 24 ч;
 * - отправка очереди сообщений.
 */
export async function runJobs(db: RootDb, now: Date, sender: MessageSender | null) {
  const settings = await loadSettings(db);
  const today = localDateOf(now);
  const { day } = parseLocalDate(today);
  const result: Record<string, unknown> = { today };

  const target = invoiceTarget(today, settings.invoiceDay);
  if (target) {
    result.drafts = await once(db, `invoices:${monthKey(target.year, target.month)}`, () =>
      generateDrafts(db, target.year, target.month),
    );
  }
  result.charged = await chargeDueInvoices(db, today);
  if (day >= settings.overdueDay) result.overdue = await processOverdue(db, today);
  result.perLesson = await processPerLesson(db, now);
  if (day >= 5) result.payrollTask = await payrollPayoutTask(db, today);
  result.unmarked = await unmarkedLessonTasks(db, now);
  result.idleLeads = await idleLeadTasks(db, now);
  result.debts = await debtTasks(db, now);
  result.messages = await deliverQueued(db, sender);
  return result;
}
