import type { Db } from "../lessons/context";

/** Кому ставить автозадачи: по умолчанию первому активному администратору (иначе владельцу), зарплаты — владельцу. */
export async function adminAssignee(db: Db, role: "ADMIN" | "OWNER" = "ADMIN"): Promise<string | null> {
  const order: ("ADMIN" | "OWNER")[] = role === "OWNER" ? ["OWNER"] : ["ADMIN", "OWNER"];
  for (const r of order) {
    const u = await db.user.findFirst({ where: { role: r, isActive: true }, orderBy: { createdAt: "asc" } });
    if (u) return u.id;
  }
  return null;
}

/**
 * Автозадача с дедупликацией по autoKey: повторный вызов не создаёт копию.
 * Если задача была закрыта, а событие повторилось с тем же ключом — не открываем заново.
 */
export async function ensureAutoTask(
  db: Db,
  t: {
    autoKey: string;
    title: string;
    type: string;
    clientId?: string;
    lessonId?: string;
    dueAt?: Date;
    description?: string;
    assignTo?: "ADMIN" | "OWNER";
  },
) {
  const existing = await db.task.findUnique({ where: { autoKey: t.autoKey } });
  if (existing) return existing;
  return db.task.create({
    data: {
      autoKey: t.autoKey,
      isAuto: true,
      title: t.title,
      description: t.description,
      type: t.type,
      priority: "HIGH",
      clientId: t.clientId,
      lessonId: t.lessonId,
      dueAt: t.dueAt,
      assigneeId: await adminAssignee(db, t.assignTo),
    },
  });
}

/** Событие разрешилось само (например, урок оплатили) — закрываем открытую автозадачу. */
export async function closeAutoTask(db: Db, autoKey: string) {
  await db.task.updateMany({ where: { autoKey, status: { not: "DONE" } }, data: { status: "DONE", doneAt: new Date() } });
}
