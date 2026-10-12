import { describe, expect, it } from "vitest";
import { createLimiter } from "./rate-limit";

describe("ограничение попыток входа", () => {
  const MIN = 60_000;

  it("после 5 неудач за 15 минут — блокировка до истечения окна с последней неудачи", () => {
    const l = createLimiter({ max: 5, windowMs: 15 * MIN });
    for (let i = 0; i < 4; i++) l.fail("a", i * MIN);
    expect(l.retryAfter("a", 4 * MIN)).toBe(0);
    l.fail("a", 4 * MIN);
    expect(l.retryAfter("a", 5 * MIN)).toBe(14 * MIN);
    // Первая неудача ушла из окна — снова можно.
    expect(l.retryAfter("a", 15 * MIN)).toBe(0);
  });

  it("успешный вход сбрасывает счётчик; ключи независимы", () => {
    const l = createLimiter({ max: 2, windowMs: 10 * MIN });
    l.fail("a", 0);
    l.fail("a", 1);
    expect(l.retryAfter("a", 2)).toBeGreaterThan(0);
    expect(l.retryAfter("b", 2)).toBe(0);
    l.reset("a");
    expect(l.retryAfter("a", 3)).toBe(0);
  });
});
