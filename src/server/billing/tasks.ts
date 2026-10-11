import type { Db } from "../lessons/context";

/** Кому ставить автозадачи «админу»: первый активный администратор, иначе владелец. */
export async function adminAssignee(db: Db): Promise<string | null> {
  const u =
    (await db.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } })) ??
    (await db.user.findFirst({ where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } }));
  return u?.id ?? null;
}

/**
 * Автозадача с дедупликацией по autoKey: повторный вызов не создаёт копию.
 * Если задача была закрыта, а событие повторилось с тем же ключом — не открываем заново.
 */
export async function ensureAutoTask(
  db: Db,
  t: { autoKey: string; title: string; type: string; clientId?: string; lessonId?: string; dueAt?: Date; description?: string },
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
      assigneeId: await adminAssignee(db),
    },
  });
}

/** Событие разрешилось само (например, урок оплатили) — закрываем открытую автозадачу. */
export async function closeAutoTask(db: Db, autoKey: string) {
  await db.task.updateMany({ where: { autoKey, status: { not: "DONE" } }, data: { status: "DONE", doneAt: new Date() } });
}
