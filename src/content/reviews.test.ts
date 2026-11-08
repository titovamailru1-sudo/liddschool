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
