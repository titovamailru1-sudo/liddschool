import { toDbDate, type LocalDate } from "@/domain/calendar";
import type { PaymentMode, Program, TariffKind } from "@/domain/constants";
import { defaultTariffName } from "@/domain/pricing";
import { DomainError } from "./errors";
import type { Db } from "./lessons/context";
import { createInvite } from "./payroll/teachers";

type RootDb = Extract<Db, { $transaction: unknown }>;

/** Цены школы из CLAUDE.md («Оплата»); групповые — нижняя граница диапазона, владелец правит в «Тарифах». */
const SCHOOL_PRICES: [TariffKind, Program, PaymentMode, number][] = [
  ["INDIVIDUAL", "EXAM", "MONTHLY", 1500],
  ["INDIVIDUAL", "EXAM", "PER_LESSON", 1700],
  ["INDIVIDUAL", "SCHOOL", "MONTHLY", 1300],
  ["INDIVIDUAL", "SCHOOL", "PER_LESSON", 1500],
  ["GROUP", "EXAM", "MONTHLY", 800],
  ["GROUP", "EXAM", "PER_LESSON", 1000],
  ["GROUP", "SCHOOL", "MONTHLY", 800],
  ["GROUP", "SCHOOL", "PER_LESSON", 1000],
];

/**
 * Первый запуск на чистой базе (продакшен): тарифы школы, шаблон ставки педагогов и владелец
 * с одноразовой ссылкой для пароля. Повторный запуск ничего не дублирует — только выдаёт новую ссылку владельцу.
 */
export async function initSchool(db: RootDb, input: { ownerEmail: string; ownerName: string; from: LocalDate }) {
  const email = input.ownerEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new DomainError("Укажите email владельца");
  const created: string[] = [];

  for (const [kind, program, paymentMode, pricePerHour] of SCHOOL_PRICES) {
    const exists = await db.tariff.findFirst({ where: { isDefault: true, kind, program, paymentMode } });
    if (exists) continue;
    await db.tariff.create({
      data: {
        kind,
        program,
        paymentMode,
        name: defaultTariffName({ kind, program, paymentMode }),
        isDefault: true,
        prices: { create: { pricePerHour, validFrom: toDbDate(input.from) } },
      },
    });
    created.push(`тариф «${defaultTariffName({ kind, program, paymentMode })}»`);
  }

  if (!(await db.ratePlan.findFirst({ where: { isDefault: true } }))) {
    const plan = await db.ratePlan.create({
      data: {
        name: "Стандартный шаблон школы",
        isDefault: true,
        type: "PER_HOUR",
        baseAmount: 700,
        groupPerStudent: 100,
        trialFixed: 500,
        payForUnexcused: false,
        bonusApply: "WHOLE_MONTH",
        versionFrom: toDbDate(input.from),
        tiers: { create: [{ thresholdHours: 30, bonusPercent: 10 }, { thresholdHours: 45, bonusPercent: 15 }] },
      },
    });
    await db.ratePlan.update({ where: { id: plan.id }, data: { familyId: plan.id } });
    created.push("шаблон ставки 700 ₽/ч (+10% от 30 ч, +15% от 45 ч)");
  }

  let owner = await db.user.findUnique({ where: { email } });
  if (owner && owner.role !== "OWNER") throw new DomainError(`${email} уже есть, но это не владелец`);
  if (!owner) {
    owner = await db.user.create({ data: { email, name: input.ownerName.trim() || "Владелец", role: "OWNER", passwordHash: "!" } });
    created.push(`владелец ${email}`);
  }
  const link = await createInvite(db, owner.id, owner.id);
  return { created, link };
}
