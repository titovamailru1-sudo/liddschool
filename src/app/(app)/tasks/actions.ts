"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zonedInstant } from "@/domain/calendar";
import { runAction, type Result } from "@/server/action-result";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { addTaskComment, createTask, setTaskStatus, taskComments, updateTask } from "@/server/tasks/service";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Укажите, что нужно сделать").max(200),
  description: z.string().max(2000).nullish(),
  assigneeId: z.string().nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  clientId: z.string().nullish(),
  leadId: z.string().nullish(),
  lessonId: z.string().nullish(),
});

export type TaskPayload = z.input<typeof taskSchema>;

function due(p: z.infer<typeof taskSchema>) {
  return p.dueDate ? zonedInstant(p.dueDate, p.dueTime || "18:00") : null;
}

function revalidateTasks() {
  revalidatePath("/tasks");
  revalidatePath("/", "layout"); // счётчик в меню
}

export async function createTaskAction(payload: TaskPayload): Promise<Result<{ id: string }>> {
  const user = await requirePermission("tasks.create");
  return runAction(async () => {
    const p = taskSchema.parse(payload);
    const t = await createTask(prisma, user, { ...p, dueAt: due(p), type: p.leadId ? "lead" : p.clientId ? "other" : "other" });
    revalidateTasks();
    return { ok: true, message: "Задача создана", data: { id: t.id } };
  });
}

export async function updateTaskAction(taskId: string, payload: TaskPayload): Promise<Result> {
  const user = await requirePermission("tasks.view");
  return runAction(async () => {
    const p = taskSchema.parse(payload);
    await updateTask(prisma, user, taskId, { title: p.title, description: p.description, assigneeId: p.assigneeId ?? null, dueAt: due(p), priority: p.priority });
    revalidateTasks();
    return { ok: true, message: "Сохранено" };
  });
}

export async function setTaskStatusAction(taskId: string, status: "NEW" | "IN_PROGRESS" | "DONE"): Promise<Result> {
  const user = await requirePermission("tasks.view");
  return runAction(async () => {
    await setTaskStatus(prisma, user, taskId, z.enum(["NEW", "IN_PROGRESS", "DONE"]).parse(status));
    revalidateTasks();
    return { ok: true, message: status === "DONE" ? "Задача выполнена" : "Статус изменён" };
  });
}

export async function addTaskCommentAction(taskId: string, text: string): Promise<Result> {
  const user = await requirePermission("tasks.view");
  return runAction(async () => {
    await addTaskComment(prisma, user, taskId, z.string().max(2000).parse(text));
    revalidateTasks();
    return { ok: true };
  });
}

export async function taskCommentsAction(taskId: string) {
  const user = await requirePermission("tasks.view");
  return taskComments(prisma, user, taskId);
}
