import { periodOf, previousPeriod, type Period, type PeriodKind } from "@/domain/crm";

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Период отчёта из адреса: ?period=week|month|quarter|custom&at=…&from=…&to=… (по умолчанию — текущий месяц). */
export function periodFromParams(sp: Record<string, string | undefined>, today: string): { kind: PeriodKind; period: Period; previous: Period } {
  const kind = (["week", "month", "quarter", "custom"].includes(sp.period ?? "") ? sp.period : "month") as PeriodKind;
  let period: Period;
  if (kind === "custom" && isDate(sp.from) && isDate(sp.to) && sp.from! <= sp.to!) period = { from: sp.from!, to: sp.to! };
  else period = periodOf(kind === "custom" ? "month" : kind, isDate(sp.at) ? sp.at! : today);
  return { kind, period, previous: previousPeriod(kind, period) };
}
