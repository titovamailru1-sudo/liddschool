import { describe, expect, it } from "vitest";
import { visibleReviews } from "./reviews";

describe("отзывы на сайте", () => {
  const all = [{ author: "Ольга", text: "Настоящий" }, { author: "Пример", text: "Заглушка", example: true }];

  it("на продакшене — только настоящие", () => {
    expect(visibleReviews(all, true).map((r) => r.author)).toEqual(["Ольга"]);
  });

  it("при разработке — и примеры (для вёрстки)", () => {
    expect(visibleReviews(all, false)).toHaveLength(2);
  });
});

describe("педагоги на сайте", async () => {
  const { SITE_TEACHERS, visibleTeacher } = await import("./teachers");
  const t = SITE_TEACHERS[0];

  it("на продакшене — только подтверждённые факты", () => {
    const v = visibleTeacher(t, true);
    expect(v.stats).toEqual(t.stats);
    expect(v.tags).toEqual(t.tags);
    expect(v.about).toBe(t.about);
  });

  it("при разработке — с черновиком", () => {
    const v = visibleTeacher(t, false);
    expect(v.stats.length).toBe(t.stats.length + (t.draft?.stats?.length ?? 0));
    expect(v.about).toContain(t.about);
  });
});
