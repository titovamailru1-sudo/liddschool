import { leadNeedsTouch } from "@/domain/crm";
import { formatDayMonth, formatTime } from "@/domain/format";
import { localDateOf } from "@/domain/calendar";
import { adminAssignee, closeAutoTask } from "../billing/tasks";
import type { Db } from "../lessons/context";

const HOUR = 3_600_000;

async function createAuto(
  db: Db,
  t: { autoKey: string; title: string; type: string; assigneeId: string | null; clientId?: string; leadId?: string; lessonId?: string; dueAt?: Date; description?: string },
) {
  const existing = await db.task.findUnique({ where: { autoKey: t.autoKey } });
  if (existing) return false;
  await db.task.create({ data: { ...t, isAuto: true, priority: "HIGH" } });
  return true;
}

/**
 * Урок не отмечен через 2 ч после окончания → задача педагогу (если у него нет входа в CRM — администратору).
 * Отметили — задача закрывается сама.
 */
export async function unmarkedLessonTasks(db: Db, now: Date) {
  const lessons = await db.lesson.findMany({
    where: { status: "PLANNED", startsAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR), lt: now } },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      teacher: { select: { userId: true, user: { select: { isActive: true } } } },
      client: { select: { fullName: true } },
      group: { select: { name: true } },
      trialForLead: { select: { childName: true } },
    },
  });
  let created = 0;
  const admin = await adminAssignee(db);
  for (const l of lessons) {
    const end = l.startsAt.getTime() + l.durationMin * 60_000;
    if (now.getTime() - end < 2 * HOUR) continue;
    const title = l.client?.fullName ?? (l.group ? `группа ${l.group.name}` : l.trialForLead ? `пробный: ${l.trialForLead.childName}` : "урок");
    const assigneeId = l.teacher.userId && l.teacher.user?.isActive ? l.teacher.userId : admin;
    if (
      await createAuto(db, {
        autoKey: `lesson-unmarked:${l.id}`,
        title: `Отметить урок ${formatDayMonth(localDateOf(l.startsAt))} ${formatTime(l.startsAt)}: ${title}`,
        type: "lesson",
        assigneeId,
        lessonId: l.id,
        dueAt: new Date(end + 24 * HOUR),
      })
    ) {
      created++;
    }
  }
  // Отмеченные уроки — закрыть их задачи.
  const open = await db.task.findMany({
    where: { autoKey: { startsWith: "lesson-unmarked:" }, status: { not: "DONE" }, lesson: { status: { not: "PLANNED" } } },
    select: { autoKey: true },
  });
  for (const t of open) await closeAutoTask(db, t.autoKey!);
  return { created, closed: open.length };
}

/** Лид без касания больше 2 дней → задача ответственному. Новое касание закрывает задачу. */
export async function idleLeadTasks(db: Db, now: Date) {
  const leads = await db.lead.findMany({
    where: { stage: { notIn: ["WON", "LOST"] } },
    select: { id: true, childName: true, stage: true, lastTouchAt: true, createdAt: true, ownerId: true },
  });
  const admin = await adminAssignee(db);
  let created = 0;
  for (const l of leads) {
    if (!leadNeedsTouch(l.stage, l.lastTouchAt, l.createdAt, now)) continue;
    const since = localDateOf(l.lastTouchAt ?? l.createdAt);
    if (
      await createAuto(db, {
        autoKey: `lead-idle:${l.id}:${since}`,
        title: `Перезвонить лиду: ${l.childName}`,
        type: "lead",
        assigneeId: l.ownerId ?? admin,
        leadId: l.id,
        dueAt: now,
      })
    ) {
      created++;
    }
  }
  // Лиды, которых коснулись после создания задачи, — закрыть задачу.
  const open = await db.task.findMany({
    where: { autoKey: { startsWith: "lead-idle:" }, status: { not: "DONE" } },
    select: { autoKey: true, createdAt: true, lead: { select: { lastTouchAt: true, stage: true } } },
  });
  let closed = 0;
  for (const t of open) {
    const touched = t.lead?.lastTouchAt && t.lead.lastTouchAt > t.createdAt;
    if (touched || t.lead?.stage === "WON" || t.lead?.stage === "LOST") {
      await closeAutoTask(db, t.autoKey!);
      closed++;
    }
  }
  return { created, closed };
}

/**
 * Поурочник в минусе дольше суток (урок проведён, оплаты нет) → «Напомнить об оплате» администратору.
 * Для абонементщиков не создаём — у них своя задача о просрочке с 3-го числа. Долг погашен — задача закрывается.
 */
export async function debtTasks(db: Db, now: Date) {
  const sums = await db.ledgerEntry.groupBy({
    by: ["clientId"],
    _sum: { amount: true },
    _max: { createdAt: true },
    where: { client: { paymentMode: "PER_LESSON", status: { not: "ARCHIVED" } } },
  });
  const month = localDateOf(now).slice(0, 7);
  let created = 0;
  for (const s of sums) {
    const balance = s._sum.amount ?? 0;
    const last = s._max.createdAt;
    if (balance >= 0 || !last || now.getTime() - last.getTime() < 24 * HOUR) continue;
    const client = await db.client.findUnique({ where: { id: s.clientId }, select: { fullName: true } });
    if (
      await createAuto(db, {
        autoKey: `debt:${s.clientId}:${month}`,
        title: `Напомнить об оплате: ${client?.fullName ?? ""}`,
        type: "debt",
        assigneeId: await adminAssignee(db),
        clientId: s.clientId,
        dueAt: now,
      })
    ) {
      created++;
    }
  }
  // Долг погашен — закрыть.
  const open = await db.task.findMany({ where: { autoKey: { startsWith: "debt:" }, status: { not: "DONE" } }, select: { autoKey: true, clientId: true } });
  let closed = 0;
  for (const t of open) {
    const bal = sums.find((s) => s.clientId === t.clientId)?._sum.amount ?? 0;
    if (bal >= 0) {
      await closeAutoTask(db, t.autoKey!);
      closed++;
    }
  }
  return { created, closed };
}
