import { describe, expect, it } from "vitest";
import { layoutLanes } from "./calendar-layout";

const iv = (id: string, s: number, e: number) => ({ id, s, e });
const lay = (items: ReturnType<typeof iv>[]) =>
  Object.fromEntries(layoutLanes(items, (x) => x.s, (x) => x.e).map((l) => [l.item.id, [l.lane, l.lanes]]));

describe("layoutLanes", () => {
  it("непересекающиеся — каждый на всю ширину", () => {
    expect(lay([iv("a", 0, 60), iv("b", 60, 120)])).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it("два пересекающихся — рядом", () => {
    expect(lay([iv("a", 0, 60), iv("b", 30, 90)])).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it("освободившаяся колонка переиспользуется внутри группы", () => {
    expect(lay([iv("a", 0, 120), iv("b", 0, 30), iv("c", 60, 90)])).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2] });
  });

  it("новая группа после окончания всех уроков предыдущей", () => {
    const r = lay([iv("a", 0, 60), iv("b", 30, 90), iv("c", 90, 120)]);
    expect(r.c).toEqual([0, 1]);
  });
});
