import { describe, expect, it } from "vitest";
import { findConflicts, overlaps, type BusySlot } from "./conflicts";

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`);
const slot = (over: Partial<BusySlot>): BusySlot => ({
  teacherId: "t1",
  clientIds: ["c1"],
  startsAt: at("06:00"),
  durationMin: 60,
  ...over,
});

describe("overlaps", () => {
  it("встык — не пересечение", () => {
    expect(overlaps(slot({}), slot({ startsAt: at("07:00") }))).toBe(false);
  });
  it("на минуту раньше конца — пересечение", () => {
    expect(overlaps(slot({}), slot({ startsAt: at("06:59") }))).toBe(true);
  });
  it("90 мин накрывает следующий час", () => {
    expect(overlaps(slot({ durationMin: 90 }), slot({ startsAt: at("07:00") }))).toBe(true);
  });
});

describe("findConflicts", () => {
  it("педагог занят — конфликт teacher", () => {
    const c = findConflicts([slot({ clientIds: ["c2"] })], [slot({ id: "x", clientIds: ["c3"] })]);
    expect(c.map((x) => x.kind)).toEqual(["teacher"]);
  });

  it("ученик занят у другого педагога — конфликт client", () => {
    const c = findConflicts([slot({ teacherId: "t2" })], [slot({ id: "x" })]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "client", clientIds: ["c1"] });
  });

  it("ученик в группе и на индивидуальном одновременно — client", () => {
    const group = slot({ id: "g", teacherId: "t2", clientIds: ["c1", "c5", "c6"] });
    expect(findConflicts([slot({ clientIds: ["c5"] })], [group])[0].clientIds).toEqual(["c5"]);
  });

  it("урок не конфликтует сам с собой (редактирование)", () => {
    expect(findConflicts([slot({ id: "x" })], [slot({ id: "x" })])).toEqual([]);
  });

  it("свободное время — пусто", () => {
    expect(findConflicts([slot({ startsAt: at("08:00") })], [slot({ id: "x" })])).toEqual([]);
  });
});
