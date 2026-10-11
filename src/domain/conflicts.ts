/** Занятость: урок в расписании или кандидат на создание. */
export interface BusySlot {
  id?: string;
  teacherId: string;
  clientIds: readonly string[]; // ученик индивидуального урока или участники группы
  startsAt: Date;
  durationMin: number;
}

export type ConflictKind = "teacher" | "client";

export interface Conflict {
  kind: ConflictKind;
  candidateStartsAt: Date;
  other: BusySlot;
  clientIds: string[]; // для kind = "client": кто занят дважды
}

function endOf(s: BusySlot): number {
  return s.startsAt.getTime() + s.durationMin * 60_000;
}

/** Интервалы пересекаются, если один начинается строго до конца другого. Встык (16:00–17:00 и 17:00) — не конфликт. */
export function overlaps(a: BusySlot, b: BusySlot): boolean {
  return a.startsAt.getTime() < endOf(b) && b.startsAt.getTime() < endOf(a);
}

/**
 * Конфликты кандидатов с существующими уроками.
 * - teacher: педагог занят — сохранять нельзя;
 * - client: ученик занят на другом уроке — только предупреждение.
 * Отменённые и перенесённые уроки вызывающий код в existing не передаёт.
 */
export function findConflicts(candidates: readonly BusySlot[], existing: readonly BusySlot[]): Conflict[] {
  const result: Conflict[] = [];
  for (const c of candidates) {
    for (const e of existing) {
      if (c.id && e.id === c.id) continue;
      if (!overlaps(c, e)) continue;
      if (c.teacherId === e.teacherId) {
        result.push({ kind: "teacher", candidateStartsAt: c.startsAt, other: e, clientIds: [] });
      }
      const both = c.clientIds.filter((id) => e.clientIds.includes(id));
      if (both.length) {
        result.push({ kind: "client", candidateStartsAt: c.startsAt, other: e, clientIds: both });
      }
    }
  }
  return result;
}
