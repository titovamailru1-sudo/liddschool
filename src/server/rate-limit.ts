/**
 * Ограничение попыток входа: после `max` неудачных попыток за `windowMs` ключ блокируется на `windowMs`
 * с момента последней неудачи. Хранится в памяти процесса — у нас один экземпляр сервера.
 */
export function createLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const failures = new Map<string, number[]>();

  const recent = (key: string, now: number) => (failures.get(key) ?? []).filter((t) => now - t < windowMs);

  return {
    /** Сколько ждать до следующей попытки (мс); 0 — можно пробовать. */
    retryAfter(key: string, now = Date.now()): number {
      const list = recent(key, now);
      if (list.length < max) return 0;
      return windowMs - (now - list[list.length - 1]);
    },
    fail(key: string, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
      // Не даём карте расти бесконечно: чистим устаревшие ключи.
      if (failures.size > 10_000) for (const [k] of failures) if (!recent(k, now).length) failures.delete(k);
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}

/** Вход: 5 неудачных попыток за 15 минут — по email и отдельно по IP (50 — в школе у всех может быть один IP). */
export const loginByEmail = createLimiter({ max: 5, windowMs: 15 * 60_000 });
export const loginByIp = createLimiter({ max: 50, windowMs: 15 * 60_000 });
