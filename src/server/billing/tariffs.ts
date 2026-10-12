import { fromDbDate, toDbDate, type LocalDate } from "@/domain/calendar";
import type { PaymentMode, Program, TariffKind } from "@/domain/constants";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface TariffInput {
  name: string;
  kind: TariffKind;
  program: Program;
  paymentMode: PaymentMode;
}

const ORDER = { kind: ["INDIVIDUAL", "GROUP"], program: ["EXAM", "SCHOOL"], paymentMode: ["MONTHLY", "PER_LESSON"] };

function checkPrice(pricePerHour: number) {
  if (!Number.isInteger(pricePerHour) || pricePerHour <= 0 || pricePerHour > 100_000) {
    throw new DomainError("Цена за урок-час — целое число рублей больше нуля");
  }
}

/** Цены меняются только с сегодняшнего дня или позже: проведённые уроки и выставленные счета не пересчитываются. */
function checkFrom(validFrom: LocalDate, today: LocalDate) {
  if (validFrom < today) throw new DomainError("Новая цена действует с сегодняшнего дня или позже — прошлые уроки не пересчитываются");
}

async function checkName(db: Db, name: string, exceptId?: string) {
  const clash = await db.tariff.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw new DomainError(`Тариф «${name}» уже есть`);
}

/** Все тарифы с историей цен: действующая цена на сегодня, запланированные и прошлые. */
export async function listTariffs(db: Db, today: LocalDate) {
  const rows = await db.tariff.findMany({
    include: { prices: { orderBy: { validFrom: "desc" } }, _count: { select: { clients: true } } },
  });
  return rows
    .map((t) => {
      const prices = t.prices.map((p) => ({ id: p.id, pricePerHour: p.pricePerHour, validFrom: fromDbDate(p.validFrom) }));
      const current = prices.find((p) => p.validFrom <= today) ?? null;
      return {
        id: t.id,
        name: t.name,
        kind: t.kind,
        program: t.program,
        paymentMode: t.paymentMode,
        isDefault: t.isDefault,
        clients: t._count.clients,
        current,
        upcoming: prices.filter((p) => p.validFrom > today).reverse(),
        past: prices.filter((p) => p.validFrom <= today && p !== current),
      };
    })
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        ORDER.kind.indexOf(a.kind) - ORDER.kind.indexOf(b.kind) ||
        ORDER.program.indexOf(a.program) - ORDER.program.indexOf(b.program) ||
        ORDER.paymentMode.indexOf(a.paymentMode) - ORDER.paymentMode.indexOf(b.paymentMode) ||
        a.name.localeCompare(b.name, "ru"),
    );
}

export type TariffListItem = Awaited<ReturnType<typeof listTariffs>>[number];

/** Тарифы, которые можно назначить ученику: индивидуальные, кроме тарифов школы (они действуют по умолчанию). */
export async function clientTariffOptions(db: Db, today: LocalDate) {
  const all = await listTariffs(db, today);
  return all
    .filter((t) => !t.isDefault && t.kind === "INDIVIDUAL")
    .map((t) => ({
      id: t.id,
      name: t.name,
      program: t.program,
      paymentMode: t.paymentMode,
      pricePerHour: t.current?.pricePerHour ?? t.upcoming[0]?.pricePerHour ?? null,
      from: t.current ? null : (t.upcoming[0]?.validFrom ?? null),
    }));
}

export type ClientTariffOption = Awaited<ReturnType<typeof clientTariffOptions>>[number];

/** Свой тариф ученика должен подходить ему по программе и способу оплаты. */
export async function checkClientTariff(db: Db, tariffId: string, program: Program, paymentMode: PaymentMode) {
  const t = await db.tariff.findUnique({ where: { id: tariffId } });
  if (!t || t.isDefault || t.kind !== "INDIVIDUAL") throw new DomainError("Тариф не найден");
  if (t.program !== program || t.paymentMode !== paymentMode) {
    throw new DomainError(`Тариф «${t.name}» не подходит: другая программа или способ оплаты`);
  }
}

export async function createTariff(db: RootDb, actorId: string, input: TariffInput & { pricePerHour: number; validFrom: LocalDate }) {
  const name = input.name.trim();
  if (!name) throw new DomainError("Укажите название тарифа");
  checkPrice(input.pricePerHour);
  await checkName(db, name);
  const t = await db.tariff.create({
    data: {
      name,
      kind: input.kind,
      program: input.program,
      paymentMode: input.paymentMode,
      isDefault: false,
      prices: { create: { pricePerHour: input.pricePerHour, validFrom: toDbDate(input.validFrom), createdById: actorId } },
    },
  });
  await db.auditLog.create({
    data: { entity: "Tariff", entityId: t.id, action: "create", userId: actorId, diff: { ...input, name } },
  });
  return t;
}

/**
 * Название можно менять всегда. Формат, программу и способ оплаты — только у своего тарифа без учеников:
 * у тарифа школы они задают, к чему он применяется.
 */
export async function updateTariff(db: RootDb, actorId: string, id: string, input: TariffInput) {
  const t = await db.tariff.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } });
  if (!t) throw new DomainError("Тариф не найден");
  const name = input.name.trim();
  if (!name) throw new DomainError("Укажите название тарифа");
  await checkName(db, name, id);
  const changed = t.kind !== input.kind || t.program !== input.program || t.paymentMode !== input.paymentMode;
  if (changed && t.isDefault) throw new DomainError("У тарифа школы можно менять только название и цену");
  if (changed && t._count.clients > 0) {
    throw new DomainError("Тариф назначен ученикам — формат, программу и оплату менять нельзя");
  }
  await db.tariff.update({ where: { id }, data: { name, kind: input.kind, program: input.program, paymentMode: input.paymentMode } });
  await db.auditLog.create({
    data: {
      entity: "Tariff",
      entityId: id,
      action: "update",
      userId: actorId,
      diff: { before: { name: t.name, kind: t.kind, program: t.program, paymentMode: t.paymentMode }, after: { ...input, name } },
    },
  });
}

/** Новая цена с даты (или исправление запланированной на ту же дату). */
export async function setTariffPrice(db: RootDb, actorId: string, tariffId: string, pricePerHour: number, validFrom: LocalDate, today: LocalDate) {
  checkPrice(pricePerHour);
  checkFrom(validFrom, today);
  const t = await db.tariff.findUnique({ where: { id: tariffId } });
  if (!t) throw new DomainError("Тариф не найден");
  const p = await db.tariffPrice.upsert({
    where: { tariffId_validFrom: { tariffId, validFrom: toDbDate(validFrom) } },
    create: { tariffId, pricePerHour, validFrom: toDbDate(validFrom), createdById: actorId },
    update: { pricePerHour, createdById: actorId },
  });
  await db.auditLog.create({
    data: { entity: "Tariff", entityId: tariffId, action: "price", userId: actorId, diff: { pricePerHour, validFrom } },
  });
  return p;
}

/** Убрать ещё не наступившую (или сегодняшнюю) цену — например, ошибочно запланированное повышение. */
export async function deleteTariffPrice(db: RootDb, actorId: string, priceId: string, today: LocalDate) {
  const p = await db.tariffPrice.findUnique({ where: { id: priceId } });
  if (!p) throw new DomainError("Цена не найдена");
  const from = fromDbDate(p.validFrom);
  if (from < today) throw new DomainError("Прошлые цены не удаляются: по ним посчитаны уроки и счета");
  const others = await db.tariffPrice.count({ where: { tariffId: p.tariffId, id: { not: p.id } } });
  if (others === 0) throw new DomainError("Это единственная цена тарифа — измените её или удалите тариф");
  await db.tariffPrice.delete({ where: { id: priceId } });
  await db.auditLog.create({
    data: { entity: "Tariff", entityId: p.tariffId, action: "price-delete", userId: actorId, diff: { pricePerHour: p.pricePerHour, validFrom: from } },
  });
}

/** Удалить можно только свой тариф, который не назначен ни одному ученику. */
export async function deleteTariff(db: RootDb, actorId: string, id: string) {
  const t = await db.tariff.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } });
  if (!t) throw new DomainError("Тариф не найден");
  if (t.isDefault) throw new DomainError("Тариф школы удалить нельзя — по нему считаются ученики без своего тарифа");
  if (t._count.clients > 0) throw new DomainError(`Тариф назначен ученикам (${t._count.clients}) — сначала смените им тариф`);
  await db.tariff.delete({ where: { id } });
  await db.auditLog.create({ data: { entity: "Tariff", entityId: id, action: "delete", userId: actorId, diff: { name: t.name } } });
}
