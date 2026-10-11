import { describe, expect, it } from "vitest";
import {
  addDays,
  fromDbDate,
  generationHorizon,
  isoWeekday,
  localDateOf,
  shiftView,
  startOfWeek,
  toDbDate,
  viewRange,
  zonedInstant,
} from "./calendar";
import { occurrencesInMonth, seriesOccurrencesInMonth, type SeriesInput } from "./schedule";

const base: SeriesInput = {
  id: "s",
  weekday: 7,
  startTime: "16:00",
  durationMin: 60,
  startsOn: "2026-01-01",
  endsOn: null,
};

const dates = (s: SeriesInput, y: number, m: number) => seriesOccurrencesInMonth(s, y, m).map((o) => o.localDate);

describe("календарь", () => {
  it("1 ноября 2026 — воскресенье", () => expect(isoWeekday("2026-11-01")).toBe(7));

  it("16:00 во Владивостоке (UTC+10) = 06:00 UTC", () => {
    expect(zonedInstant("2026-11-01", "16:00").toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });

  it("09:00 во Владивостоке приходится на предыдущий день по UTC, но дата остаётся местной", () => {
    const at = zonedInstant("2026-11-02", "09:00");
    expect(at.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(localDateOf(at)).toBe("2026-11-02");
  });

  it("поле @db.Date туда и обратно не сдвигается", () => {
    expect(fromDbDate(toDbDate("2026-11-30"))).toBe("2026-11-30");
  });
});

describe("seriesOccurrencesInMonth", () => {
  it("воскресенья ноября 2026", () => {
    expect(dates(base, 2026, 11)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  });

  it("серия, начавшаяся в середине месяца, даёт только оставшиеся уроки", () => {
    expect(dates({ ...base, startsOn: "2026-11-17" }, 2026, 11)).toEqual(["2026-11-22", "2026-11-29"]);
  });

  it("день начала серии включается", () => {
    expect(dates({ ...base, startsOn: "2026-11-15" }, 2026, 11)[0]).toBe("2026-11-15");
  });

  it("дата окончания включается", () => {
    expect(dates({ ...base, endsOn: "2026-11-15" }, 2026, 11)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
  });

  it("серия, закончившаяся до месяца или начинающаяся после, пуста", () => {
    expect(dates({ ...base, endsOn: "2026-10-31" }, 2026, 11)).toEqual([]);
    expect(dates({ ...base, startsOn: "2026-12-01" }, 2026, 11)).toEqual([]);
  });

  it.each([
    [2026, 2, 4], // февраль 2026: 28 дней, вс 1, 8, 15, 22
    [2028, 2, 4], // високосный: 29 дней, вт 29 — но вс 6, 13, 20, 27
    [2026, 8, 5], // 31 день: вс 2, 9, 16, 23, 30
    [2026, 9, 4], // 30 дней
  ])("%i-%i: %i воскресений", (y, m, n) => expect(dates(base, y, m)).toHaveLength(n));

  it("29 февраля в високосном году попадает в расписание", () => {
    expect(dates({ ...base, weekday: 2 }, 2028, 2)).toContain("2028-02-29");
  });

  it("startsAt — момент в UTC по поясу школы", () => {
    const [first] = seriesOccurrencesInMonth({ ...base, startTime: "17:30" }, 2026, 11);
    expect(first.startsAt.toISOString()).toBe("2026-11-01T07:30:00.000Z");
  });

  it("некорректный день недели или время → ошибка", () => {
    expect(() => seriesOccurrencesInMonth({ ...base, weekday: 0 }, 2026, 11)).toThrow();
    expect(() => seriesOccurrencesInMonth({ ...base, startTime: "25:00" }, 2026, 11)).toThrow();
  });
});

describe("occurrencesInMonth", () => {
  it("несколько серий ученика — по порядку во времени", () => {
    const list: SeriesInput[] = [
      { ...base, id: "fri", weekday: 5 },
      { ...base, id: "tue", weekday: 2 },
    ];
    const occ = occurrencesInMonth(list, 2026, 11);
    expect(occ).toHaveLength(8);
    expect(occ.slice(0, 3).map((o) => o.localDate)).toEqual(["2026-11-03", "2026-11-06", "2026-11-10"]);
  });
});

describe("диапазоны видов календаря", () => {
  it("неделя — с понедельника по воскресенье", () => {
    expect(viewRange("week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(startOfWeek("2026-10-12")).toBe("2026-10-12");
  });

  it("месяц — полные недели: ноябрь 2026 с 26.10 по 06.12", () => {
    expect(viewRange("month", "2026-11-15")).toEqual({ from: "2026-10-26", to: "2026-12-06" });
  });

  it("список — календарный месяц", () => {
    expect(viewRange("list", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("навигация по месяцам через год", () => {
    expect(shiftView("month", "2026-12-20", 1)).toBe("2027-01-01");
    expect(shiftView("list", "2026-01-05", -1)).toBe("2025-12-01");
    expect(shiftView("week", "2026-10-11", -1)).toBe("2026-10-04");
  });

  it("горизонт генерации — конец следующего месяца", () => {
    expect(generationHorizon("2026-10-11")).toBe("2026-11-30");
    expect(generationHorizon("2026-12-31")).toBe("2027-01-31");
  });

  it("addDays через границу месяца", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
});
