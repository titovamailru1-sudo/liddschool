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

export interface TariffRow {
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

/** Тариф, действующий на дату: строка с наибольшей validFrom ≤ on. */
export function tariffOn(tariffs: readonly TariffRow[], key: TariffKey, on: LocalDate): TariffRow {
  let best: TariffRow | undefined;
  for (const t of tariffs) {
    if (t.kind !== key.kind || t.program !== key.program || t.paymentMode !== key.paymentMode) continue;
    if (t.validFrom > on) continue;
    if (!best || t.validFrom > best.validFrom) best = t;
  }
  if (!best) {
    throw new Error(
      `Нет тарифа ${key.kind}/${key.program}/${key.paymentMode}, действующего на ${on}`,
    );
  }
  return best;
}
