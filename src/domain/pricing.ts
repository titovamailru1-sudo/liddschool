import type { LocalDate } from "./calendar";
import type { PaymentMode, Program, TariffKind } from "./constants";

/** Длительность урока → урок-часы: 90 мин → 1,5; 45 мин → 0,75. Допустимы только шаги по 15 минут. */
export function lessonHours(durationMin: number): number {
  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % 15 !== 0) {
    throw new RangeError(`Длительность урока должна быть кратна 15 минутам: ${durationMin}`);
  }
  return durationMin / 60;
}

/** Стоимость урока в целых рублях: часы × тариф за урок-час. */
export function lessonPrice(hours: number, pricePerHour: number): number {
  return Math.round(hours * pricePerHour);
}

/** Название тарифа школы для сочетания: «ОГЭ/ЕГЭ · индивидуально · абонемент». */
export function defaultTariffName(key: TariffKey): string {
  const program = key.program === "EXAM" ? "ОГЭ/ЕГЭ" : "Школьная программа";
  const kind = key.kind === "GROUP" ? "группа" : "индивидуально";
  const mode = key.paymentMode === "MONTHLY" ? "абонемент" : "поурочно";
  return `${program} · ${kind} · ${mode}`;
}

/** Цена тарифа с датой начала действия (одна строка истории цен). */
export interface TariffRow {
  tariffId: string;
  name: string;
  isDefault: boolean; // тариф школы для своего сочетания
  kind: TariffKind;
  program: Program;
  paymentMode: PaymentMode;
  pricePerHour: number;
  validFrom: LocalDate;
}

export interface TariffKey {
  kind: TariffKind;
  program: Program;
  paymentMode: PaymentMode;
}

function latest(rows: readonly TariffRow[], on: LocalDate): TariffRow | undefined {
  let best: TariffRow | undefined;
  for (const t of rows) {
    if (t.validFrom > on) continue;
    if (!best || t.validFrom > best.validFrom) best = t;
  }
  return best;
}

/** Тариф школы на дату: цена с наибольшей validFrom ≤ on у тарифа по умолчанию для сочетания. */
export function tariffOn(tariffs: readonly TariffRow[], key: TariffKey, on: LocalDate): TariffRow {
  const best = latest(
    tariffs.filter((t) => t.isDefault && t.kind === key.kind && t.program === key.program && t.paymentMode === key.paymentMode),
    on,
  );
  if (!best) {
    throw new Error(`Нет тарифа ${key.kind}/${key.program}/${key.paymentMode}, действующего на ${on}`);
  }
  return best;
}

/** Цена конкретного тарифа на дату (undefined — если на эту дату цены ещё не было). */
export function tariffPriceOn(tariffs: readonly TariffRow[], tariffId: string, on: LocalDate): TariffRow | undefined {
  return latest(
    tariffs.filter((t) => t.tariffId === tariffId),
    on,
  );
}

/**
 * Цена урок-часа для ученика: его собственный тариф, если он подходит по формату, программе и способу оплаты
 * и уже действует на дату урока; иначе — тариф школы.
 */
export function rateFor(tariffs: readonly TariffRow[], key: TariffKey, on: LocalDate, clientTariffId?: string | null): number {
  if (clientTariffId) {
    const own = tariffPriceOn(tariffs, clientTariffId, on);
    if (own && own.kind === key.kind && own.program === key.program && own.paymentMode === key.paymentMode) return own.pricePerHour;
  }
  return tariffOn(tariffs, key, on).pricePerHour;
}
