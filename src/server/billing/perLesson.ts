import { randomBytes } from "node:crypto";
import { coverage, perLessonActions, renderLessonPaymentMessage } from "@/domain/billing";
import { localDateOf } from "@/domain/calendar";
import { formatDayMonth, formatTime } from "@/domain/format";
import { greetingName, studentNameGenitive } from "@/domain/names";
import { lessonHours, lessonPrice, rateFor, type TariffRow } from "@/domain/pricing";
import { loadTariffs, type Db } from "../lessons/context";
import { queueMessage } from "../messaging/outbox";
import { clientBalance, clientLessons, type ClientLesson } from "./clientLessons";
import { appUrl, loadSettings } from "./settings";
import { closeAutoTask, ensureAutoTask } from "./tasks";

const HORIZON_DAYS = 14; // на сколько вперёд распределяем баланс по урокам

function priceOf(tariffs: TariffRow[], l: ClientLesson, clientTariffId: string | null) {
  const rate = rateFor(
    tariffs,
    { kind: l.isGroup ? "GROUP" : "INDIVIDUAL", program: l.program, paymentMode: "PER_LESSON" },
    localDateOf(l.startsAt),
    l.isGroup ? null : clientTariffId,
  );
  return lessonPrice(lessonHours(l.durationMin), rate);
}

async function upcomingFor(db: Db, clientId: string, now: Date, tariffs: TariffRow[], clientTariffId: string | null) {
  const lessons = await clientLessons(
    db,
    clientId,
    { gte: now, lt: new Date(now.getTime() + HORIZON_DAYS * 86_400_000) },
    { status: "PLANNED", isTrial: false },
  );
  return lessons.map((l) => ({ lesson: l, price: priceOf(tariffs, l, clientTariffId) }));
}

const taskKey = (lessonId: string, clientId: string) => `lesson-unpaid:${lessonId}:${clientId}`;

/**
 * Поурочная оплата для одного ученика: распределить баланс по ближайшим урокам, за 48 ч отправить ссылку
 * на неоплаченный урок, за 24 ч пометить «под угрозой» и поставить задачу; оплаченные — снять пометку.
 */
export async function processClientPerLesson(db: Db, clientId: string, now: Date, opts: { sendLinks: boolean }) {
  const [tariffs, settings] = await Promise.all([loadTariffs(db), loadSettings(db)]);
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { parents: { orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }], take: 1 } },
  });
  if (!client) return { links: 0, atRisk: 0 };
  const upcoming = await upcomingFor(db, clientId, now, tariffs, client.tariffId);
  const balance = await clientBalance(db, clientId);
  const covered = coverage(
    balance,
    upcoming.map((u) => ({ id: u.lesson.id, startsAt: u.lesson.startsAt, price: u.price })),
  );
  const links = await db.paymentLink.findMany({
    where: { clientId, lessonId: { in: upcoming.map((u) => u.lesson.id) } },
  });
  const linkOf = new Map(links.map((l) => [l.lessonId!, l]));
  let sentLinks = 0;
  let atRisk = 0;

  for (const { lesson, price } of upcoming) {
    const link = linkOf.get(lesson.id);
    const actions = perLessonActions(
      now,
      { startsAt: lesson.startsAt, covered: covered.get(lesson.id)!, linkSentAt: link?.sentAt ?? null, atRiskAt: link?.atRiskAt ?? null },
      settings.perLessonLinkHours,
      settings.perLessonDeadlineHours,
    );
    if (actions.sendLink && opts.sendLinks) {
      const token = link?.token ?? randomBytes(12).toString("base64url");
      const when = `${formatDayMonth(localDateOf(lesson.startsAt))} ${formatTime(lesson.startsAt)}`;
      await db.paymentLink.upsert({
        where: { lessonId_clientId: { lessonId: lesson.id, clientId } },
        create: { lessonId: lesson.id, clientId, token, amount: price, purpose: `Урок ${when}, ${client.fullName}`, sentAt: now },
        update: { amount: price, sentAt: now },
      });
      const parent = client.parents[0];
      const text = renderLessonPaymentMessage({
        parentName: parent ? greetingName(parent.fullName) : "",
        studentNameGen: studentNameGenitive(client.fullName, client.gender, client.fullNameGen),
        subject: lesson.subject,
        startsAt: lesson.startsAt,
        durationMin: lesson.durationMin,
        amount: price,
        deadline: new Date(lesson.startsAt.getTime() - settings.perLessonDeadlineHours * 3_600_000),
        payUrl: `${appUrl()}/pay/${token}`,
      }).replace("Здравствуйте, ! ", "Здравствуйте! ");
      await queueMessage(db, { clientId, kind: "lesson_payment", text, lessonId: lesson.id });
      sentLinks++;
    }
    if (actions.markAtRisk) {
      await db.paymentLink.upsert({
        where: { lessonId_clientId: { lessonId: lesson.id, clientId } },
        create: {
          lessonId: lesson.id,
          clientId,
          token: randomBytes(12).toString("base64url"),
          amount: price,
          purpose: `Урок ${formatDayMonth(localDateOf(lesson.startsAt))}, ${client.fullName}`,
          atRiskAt: now,
        },
        update: { atRiskAt: now },
      });
      await ensureAutoTask(db, {
        autoKey: taskKey(lesson.id, clientId),
        title: `Нет оплаты урока ${formatDayMonth(localDateOf(lesson.startsAt))} ${formatTime(lesson.startsAt)}: ${client.fullName}`,
        description: "Перевести урок в долг или отменить.",
        type: "lesson",
        clientId,
        lessonId: lesson.id,
        dueAt: lesson.startsAt,
      });
      atRisk++;
    }
    if (actions.clearAtRisk && link) {
      await db.paymentLink.update({ where: { id: link.id }, data: { atRiskAt: null } });
      await closeAutoTask(db, taskKey(lesson.id, clientId));
    }
  }
  return { links: sentLinks, atRisk };
}

/** После платежа или корректировки: только снять пометки «под угрозой» с оплаченных уроков (без рассылки). */
export async function refreshClientCoverage(db: Db, clientId: string, now: Date) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { paymentMode: true } });
  if (client?.paymentMode !== "PER_LESSON") return;
  await processClientPerLesson(db, clientId, now, { sendLinks: false });
}

/** Фоновая задача: все ученики на поурочной оплате. */
export async function processPerLesson(db: Db, now: Date) {
  const clients = await db.client.findMany({ where: { paymentMode: "PER_LESSON", status: "ACTIVE" }, select: { id: true } });
  const total = { links: 0, atRisk: 0 };
  for (const c of clients) {
    const r = await processClientPerLesson(db, c.id, now, { sendLinks: true });
    total.links += r.links;
    total.atRisk += r.atRisk;
  }
  return total;
}
