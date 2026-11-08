import { describe, expect, it } from "vitest";
import { isMemberAt, journalCell, journalSummary } from "./groups";

describe("участие в группе", () => {
  const lessonStart = new Date("2026-11-10T06:00:00Z"); // 10.11 16:00 по Владивостоку
  const dayEnd = new Date("2026-11-10T14:00:00Z"); // начало 11.11 по Владивостоку

  it("вступил в день урока — урок его", () => {
    expect(isMemberAt({ joinedAt: new Date("2026-11-09T14:00:00Z"), leftAt: null }, lessonStart, dayEnd)).toBe(true);
  });

  it("вступил на следующий день — нет", () => {
    expect(isMemberAt({ joinedAt: dayEnd, leftAt: null }, lessonStart, dayEnd)).toBe(false);
  });

  it("вышел с этого дня (до начала урока) — нет; вышел позже — да", () => {
    const joinedAt = new Date("2026-10-01T00:00:00Z");
    expect(isMemberAt({ joinedAt, leftAt: new Date("2026-11-09T14:00:00Z") }, lessonStart, dayEnd)).toBe(false);
    expect(isMemberAt({ joinedAt, leftAt: new Date("2026-11-10T14:00:00Z") }, lessonStart, dayEnd)).toBe(true);
  });
});

describe("журнал посещаемости", () => {
  const base = { member: true, lessonStatus: "DONE" as const, attendance: null, lessonEnded: true };

  it.each([
    [{ attendance: "PRESENT" as const }, "present"],
    [{ attendance: "ABSENT_EXCUSED" as const }, "excused"],
    [{ attendance: "ABSENT_UNEXCUSED" as const }, "unexcused"],
    [{ lessonStatus: "CANCELLED" as const }, "cancelled"],
    [{ lessonStatus: "PLANNED" as const, lessonEnded: false }, "planned"],
    [{ lessonStatus: "PLANNED" as const }, "unmarked"],
    [{ member: false, attendance: "PRESENT" as const }, "none"],
  ])("%o → %s", (over, cell) => {
    expect(journalCell({ ...base, ...over })).toBe(cell);
  });

  it("сводка: процент среди отмеченных уроков", () => {
    expect(journalSummary(["present", "present", "excused", "unexcused", "planned", "none"])).toEqual({ present: 2, excused: 1, unexcused: 1, percent: 50 });
    expect(journalSummary(["planned"])).toEqual({ present: 0, excused: 0, unexcused: 0, percent: null });
  });
});
