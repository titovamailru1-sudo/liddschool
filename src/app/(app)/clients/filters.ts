import type { ClientFilters } from "@/server/clients/queries";

/** Фильтры таблицы клиентов из адреса страницы (используются и выгрузкой в Excel). */
export function parseClientFilters(sp: Record<string, string | undefined>): ClientFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
  return {
    q: sp.q?.trim() || undefined,
    status: pick(sp.status, ["ACTIVE", "PAUSED", "ARCHIVED", "ALL"] as const),
    program: pick(sp.program, ["EXAM", "SCHOOL"] as const),
    paymentMode: pick(sp.mode, ["MONTHLY", "PER_LESSON"] as const),
    teacherId: sp.teacher || undefined,
    debt: sp.debt === "1",
    sort: pick(sp.sort, ["name", "balance"] as const),
  };
}

