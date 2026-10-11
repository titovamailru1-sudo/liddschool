import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { addDays, localDateOf, startOfDay } from "@/domain/calendar";
import { taskDisplayStatus } from "@/domain/crm";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";
import type { CurrentUser } from "../session";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface TaskFilters {
  assigneeId?: string; // «me» — мои
  due?: "overdue" | "today" | "week";
  type?: string;
  auto?: boolean;
  clientId?: string;
  leadId?: string;
  showDone?: boolean;
}

/** Педагог видит только свои задачи. */
function scope(user: CurrentUser): Prisma.TaskWhereInput {
  return user.role === "TEACHER" ? { assigneeId: user.id } : {};
}

export const TASK_TYPE_LABEL: Record<string, string> = {
  debt: "Долг",
  subscription: "Абонемент",
  lesson: "Урок",
  lead: "Лид",
  payroll: "Зарплата",
  other: "Другое",
};

export async function listTasks(db: Db, user: CurrentUser, f: TaskFilters, now: Date) {
  const today = localDateOf(now);
  const dueWhere: Prisma.TaskWhereInput =
    f.due === "overdue"
      ? { dueAt: { lt: now }, status: { not: "DONE" } }
      : f.due === "today"
        ? { dueAt: { gte: startOfDay(today), lt: startOfDay(addDays(today, 1)) } }
        : f.due === "week"
          ? { dueAt: { gte: startOfDay(today), lt: startOfDay(addDays(today, 7)) } }
          : {};
  const rows = await db.task.findMany({
    where: {
      AND: [
        scope(user),
        f.assigneeId === "me" ? { assigneeId: user.id } : f.assigneeId ? { assigneeId: f.assigneeId } : {},
        dueWhere,
        f.type ? { type: f.type } : {},
        f.auto === undefined ? {} : { isAuto: f.auto },
        f.clientId ? { clientId: f.clientId } : {},
        f.leadId ? { leadId: f.leadId } : {},
        // Выполненные — за последние 30 дней, если не просили все.
        f.showDone ? {} : { OR: [{ status: { not: "DONE" } }, { doneAt: { gte: addDaysDate(now, -30) } }] },
      ],
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    include: {
      assignee: { select: { id: true, name: true } },
      client: { select: { id: true, fullName: true } },
      lead: { select: { id: true, childName: true } },
      lesson: { select: { id: true, startsAt: true } },
      _count: { select: { comments: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    display: taskDisplayStatus(t.status, t.dueAt, now),
    priority: t.priority,
    dueAt: t.dueAt?.toISOString() ?? null,
    isAuto: t.isAuto,
    assignee: t.assignee,
    client: t.client,
    lead: t.lead ? { id: t.lead.id, name: t.lead.childName } : null,
    lesson: t.lesson ? { id: t.lesson.id, startsAt: t.lesson.startsAt.toISOString() } : null,
    comments: t._count.comments,
  }));
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

function addDaysDate(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

export async function taskComments(db: Db, user: CurrentUser, taskId: string) {
  const t = await db.task.findFirst({ where: { id: taskId, ...scope(user) }, select: { id: true } });
  if (!t) return [];
  const rows = await db.taskComment.findMany({ where: { taskId }, orderBy: { at: "asc" }, include: { author: { select: { name: true } } } });
  return rows.map((c) => ({ id: c.id, text: c.text, at: c.at.toISOString(), author: c.author?.name ?? "система" }));
}

/** Просроченные задачи пользователя — для счётчика в меню. */
export async function overdueCount(db: Db, userId: string, now: Date) {
  return db.task.count({ where: { assigneeId: userId, status: { not: "DONE" }, dueAt: { lt: now } } });
}

/** Кому можно поручить: активные сотрудники и педагоги с входом в CRM. */
export async function assignees(db: Db) {
  return db.user.findMany({ where: { isActive: true }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } });
}

export interface TaskInput {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueAt?: Date | null;
  priority?: TaskPriority;
  type?: string;
  clientId?: string | null;
  leadId?: string | null;
  lessonId?: string | null;
}

export async function createTask(db: RootDb, user: CurrentUser, input: TaskInput) {
  if (!input.title.trim()) throw new DomainError("Укажите, что нужно сделать");
  // Педагог ставит задачи только себе.
  const assigneeId = user.role === "TEACHER" ? user.id : (input.assigneeId ?? user.id);
  const task = await db.task.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigneeId,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? "NORMAL",
      type: input.type ?? "other",
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      lessonId: input.lessonId ?? null,
      createdById: user.id,
    },
  });
  await db.auditLog.create({ data: { entity: "Task", entityId: task.id, action: "create", userId: user.id } });
  return task;
}

async function ownTask(db: Db, user: CurrentUser, taskId: string) {
  const t = await db.task.findFirst({ where: { id: taskId, ...scope(user) } });
  if (!t) throw new DomainError("Задача не найдена");
  return t;
}

export async function updateTask(db: RootDb, user: CurrentUser, taskId: string, input: Partial<TaskInput>) {
  await ownTask(db, user, taskId);
  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new DomainError("Укажите, что нужно сделать");
    data.title = input.title.trim();
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assigneeId !== undefined && user.role !== "TEACHER") {
    data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
  }
  await db.task.update({ where: { id: taskId }, data });
  await db.auditLog.create({ data: { entity: "Task", entityId: taskId, action: "update", userId: user.id } });
}

export async function setTaskStatus(db: RootDb, user: CurrentUser, taskId: string, status: TaskStatus) {
  await ownTask(db, user, taskId);
  await db.task.update({ where: { id: taskId }, data: { status, doneAt: status === "DONE" ? new Date() : null } });
  await db.auditLog.create({ data: { entity: "Task", entityId: taskId, action: "status", userId: user.id, diff: { status } } });
}

export async function addTaskComment(db: RootDb, user: CurrentUser, taskId: string, text: string) {
  if (!text.trim()) throw new DomainError("Пустой комментарий");
  await ownTask(db, user, taskId);
  return db.taskComment.create({ data: { taskId, text: text.trim(), authorId: user.id } });
}
