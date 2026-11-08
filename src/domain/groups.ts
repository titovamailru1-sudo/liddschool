import type { AttendanceStatus, LessonStatus } from "./constants";

/** Период участия ученика в группе: вступил (начало дня) и вышел (момент, с которого уроки уже не его). */
export interface Membership {
  joinedAt: Date;
  leftAt: Date | null;
}

/**
 * Ученик числится в группе на урок: вступил не позже дня урока и не вышел до его начала.
 * То же правило, что при отметке посещаемости и в счетах (src/server/lessons/context.ts, billing/clientLessons.ts).
 */
export function isMemberAt(m: Membership, lessonStart: Date, lessonDayEnd: Date): boolean {
  return m.joinedAt < lessonDayEnd && (!m.leftAt || m.leftAt > lessonStart);
}

/** Клетка журнала «ученик × дата». */
export type JournalCell = "present" | "excused" | "unexcused" | "planned" | "unmarked" | "cancelled" | "none";

export function journalCell(input: {
  member: boolean; // числится в группе на дату урока
  lessonStatus: LessonStatus;
  attendance: AttendanceStatus | null;
  lessonEnded: boolean;
}): JournalCell {
  if (!input.member) return "none";
  if (input.lessonStatus === "CANCELLED") return "cancelled";
  if (input.lessonStatus === "DONE") {
    if (input.attendance === "PRESENT") return "present";
    if (input.attendance === "ABSENT_EXCUSED") return "excused";
    if (input.attendance === "ABSENT_UNEXCUSED") return "unexcused";
    return "none";
  }
  return input.lessonEnded ? "unmarked" : "planned";
}

/** Сводка по ученику за период: был / пропуски / процент посещаемости среди отмеченных уроков. */
export function journalSummary(cells: readonly JournalCell[]) {
  const present = cells.filter((c) => c === "present").length;
  const excused = cells.filter((c) => c === "excused").length;
  const unexcused = cells.filter((c) => c === "unexcused").length;
  const marked = present + excused + unexcused;
  return { present, excused, unexcused, percent: marked ? Math.round((present / marked) * 100) : null };
}
