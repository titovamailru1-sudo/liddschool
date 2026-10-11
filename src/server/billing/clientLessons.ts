import type { Prisma } from "@prisma/client";
import { addDays, localDateOf, startOfDay } from "@/domain/calendar";
import type { AttendanceStatus } from "@/domain/constants";
import type { Db } from "../lessons/context";

export interface ClientLesson {
  id: string;
  startsAt: Date;
  durationMin: number;
  subject: string;
  program: "EXAM" | "SCHOOL";
  status: "PLANNED" | "DONE" | "CANCELLED" | "MOVED";
  cancelledBy: "SCHOOL" | "CLIENT" | null;
  movedToId: string | null;
  isGroup: boolean;
  isTrial: boolean;
  createdAt: Date;
  attendance: AttendanceStatus | null; // отметка этого ученика
}

/**
 * Уроки ученика в интервале: индивидуальные и групповые (если состоял в группе на дату урока).
 */
export async function clientLessons(
  db: Db,
  clientId: string,
  range: { gte: Date; lt: Date },
  where: Prisma.LessonWhereInput = {},
): Promise<ClientLesson[]> {
  const rows = await db.lesson.findMany({
    where: {
      ...where,
      startsAt: range,
      OR: [{ clientId }, { group: { members: { some: { clientId } } } }],
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      subject: true,
      program: true,
      status: true,
      cancelledBy: true,
      movedToId: true,
      groupId: true,
      isTrial: true,
      createdAt: true,
      attendances: { where: { clientId }, select: { status: true } },
      group: { select: { members: { where: { clientId }, select: { joinedAt: true, leftAt: true } } } },
    },
  });
  return rows
    .filter((l) => {
      if (!l.groupId) return true;
      const m = l.group?.members[0];
      if (!m) return false;
      const dayEnd = startOfDay(addDays(localDateOf(l.startsAt), 1));
      return m.joinedAt < dayEnd && (!m.leftAt || m.leftAt > l.startsAt);
    })
    .map((l) => ({
      id: l.id,
      startsAt: l.startsAt,
      durationMin: l.durationMin,
      subject: l.subject,
      program: l.program,
      status: l.status,
      cancelledBy: l.cancelledBy,
      movedToId: l.movedToId,
      isGroup: !!l.groupId,
      isTrial: l.isTrial,
      createdAt: l.createdAt,
      attendance: l.attendances[0]?.status ?? null,
    }));
}

/** Корни цепочек переноса: для каждого урока — все его предшественники (перенесён с …). */
export async function moveAncestors(db: Db, lessonIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>(lessonIds.map((id) => [id, []]));
  let frontier = new Map(lessonIds.map((id) => [id, id])); // текущий урок → исходный запрос
  for (let depth = 0; depth < 10 && frontier.size; depth++) {
    const parents = await db.lesson.findMany({
      where: { movedToId: { in: [...frontier.keys()] } },
      select: { id: true, movedToId: true },
    });
    const next = new Map<string, string>();
    for (const p of parents) {
      const origin = frontier.get(p.movedToId!)!;
      result.get(origin)!.push(p.id);
      next.set(p.id, origin);
    }
    frontier = next;
  }
  return result;
}

export async function clientBalance(db: Db, clientId: string): Promise<number> {
  const r = await db.ledgerEntry.aggregate({ where: { clientId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
