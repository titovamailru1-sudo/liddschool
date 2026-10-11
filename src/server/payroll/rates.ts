import type { BonusApply } from "@prisma/client";
import { addDays, firstOfMonth, fromDbDate, lastOfMonth, parseLocalDate, toDbDate, type LocalDate } from "@/domain/calendar";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface PlanInput {
  name: string;
  baseAmount: number;
  groupPerStudent: number;
  trialFixed: number;
  payForUnexcused: boolean;
  bonusApply: BonusApply;
  tiers: { thresholdHours: number; bonusPercent: number }[];
}

/** 1-е число следующего месяца — с этой даты действуют изменения ставок. */
export function nextMonthStart(today: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(today);
  return addDays(lastOfMonth(year, month), 1);
}

function validate(input: PlanInput) {
  if (!input.name.trim()) throw new DomainError("Укажите название шаблона");
  for (const v of [input.baseAmount, input.groupPerStudent, input.trialFixed]) {
    if (!Number.isInteger(v) || v < 0) throw new DomainError("Суммы — целые рубли, не меньше нуля");
  }
  const thresholds = input.tiers.map((t) => t.thresholdHours);
  if (new Set(thresholds).size !== thresholds.length) throw new DomainError("Пороги надбавки не должны повторяться");
  if (input.tiers.some((t) => t.thresholdHours <= 0 || t.bonusPercent <= 0 || t.bonusPercent > 100)) {
    throw new DomainError("Порог — больше 0 часов, надбавка — от 0 до 100 %");
  }
}

const planData = (i: PlanInput) => ({
  name: i.name.trim(),
  baseAmount: i.baseAmount,
  groupPerStudent: i.groupPerStudent,
  trialFixed: i.trialFixed,
  payForUnexcused: i.payForUnexcused,
  bonusApply: i.bonusApply,
});

/** Действующие шаблоны (последние версии) и сколько педагогов на каждом с 1-го числа следующего месяца. */
export async function listPlans(db: Db, today: LocalDate) {
  const plans = await db.ratePlan.findMany({
    where: { isArchived: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { tiers: { orderBy: { thresholdHours: "asc" } } },
  });
  const teachers = await db.teacher.findMany({ where: { isActive: true }, select: { id: true } });
  const usage = new Map<string, number>();
  for (const t of teachers) {
    const a = await planAssignmentOn(db, t.id, nextMonthStart(today));
    if (a) usage.set(a.planId, (usage.get(a.planId) ?? 0) + 1);
  }
  return plans.map((p) => ({
    id: p.id,
    familyId: p.familyId ?? p.id,
    name: p.name,
    isDefault: p.isDefault,
    baseAmount: p.baseAmount,
    groupPerStudent: p.groupPerStudent,
    trialFixed: p.trialFixed,
    payForUnexcused: p.payForUnexcused,
    bonusApply: p.bonusApply,
    versionFrom: p.versionFrom ? fromDbDate(p.versionFrom) : null,
    tiers: p.tiers.map((t) => ({ thresholdHours: Number(t.thresholdHours), bonusPercent: Number(t.bonusPercent) })),
    teachers: usage.get(p.id) ?? 0,
  }));
}

export type PlanView = Awaited<ReturnType<typeof listPlans>>[number];

async function planAssignmentOn(db: Db, teacherId: string, on: LocalDate) {
  return db.teacherRatePlan.findFirst({
    where: { teacherId, validFrom: { lte: toDbDate(on) } },
    orderBy: { validFrom: "desc" },
  });
}

/** Новый шаблон. Педагогам назначается отдельно. */
export async function createPlan(db: RootDb, actorId: string, input: PlanInput, today: LocalDate) {
  validate(input);
  return db.$transaction(async (tx) => {
    const plan = await tx.ratePlan.create({
      data: { ...planData(input), versionFrom: toDbDate(firstOfMonthOf(today)), tiers: { create: input.tiers } },
    });
    await tx.ratePlan.update({ where: { id: plan.id }, data: { familyId: plan.id } });
    await tx.auditLog.create({ data: { entity: "RatePlan", entityId: plan.id, action: "create", userId: actorId, diff: JSON.parse(JSON.stringify(input)) } });
    return plan;
  });
}

function firstOfMonthOf(d: LocalDate) {
  const { year, month } = parseLocalDate(d);
  return firstOfMonth(year, month);
}

/**
 * Изменить шаблон. Ставка меняется только с 1-го числа следующего месяца: создаётся новая версия,
 * педагоги этого шаблона переводятся на неё с этой даты; прошлые и текущий месяц считаются по старой.
 * Если версия ещё не вступила в силу — правится на месте.
 */
export async function revisePlan(db: RootDb, actorId: string, planId: string, input: PlanInput, today: LocalDate) {
  validate(input);
  const effective = nextMonthStart(today);
  const old = await db.ratePlan.findUnique({ where: { id: planId } });
  if (!old || old.isArchived) throw new DomainError("Шаблон не найден");

  return db.$transaction(async (tx) => {
    if (old.versionFrom && fromDbDate(old.versionFrom) >= effective) {
      await tx.rateTier.deleteMany({ where: { planId } });
      await tx.ratePlan.update({ where: { id: planId }, data: { ...planData(input), tiers: { create: input.tiers } } });
      await tx.auditLog.create({ data: { entity: "RatePlan", entityId: planId, action: "update", userId: actorId, diff: JSON.parse(JSON.stringify(input)) } });
      return { planId, effective };
    }
    const next = await tx.ratePlan.create({
      data: {
        ...planData(input),
        isDefault: old.isDefault,
        familyId: old.familyId ?? old.id,
        versionFrom: toDbDate(effective),
        tiers: { create: input.tiers },
      },
    });
    await tx.ratePlan.update({ where: { id: old.id }, data: { isArchived: true, isDefault: false } });

    // Педагоги, у которых с даты вступления действует старая версия, переходят на новую.
    const teachers = await tx.teacher.findMany({ select: { id: true } });
    for (const t of teachers) {
      const current = await planAssignmentOn(tx, t.id, effective);
      if (current?.planId !== old.id) continue;
      await tx.teacherRatePlan.upsert({
        where: { teacherId_validFrom: { teacherId: t.id, validFrom: toDbDate(effective) } },
        create: { teacherId: t.id, planId: next.id, validFrom: toDbDate(effective) },
        update: { planId: next.id },
      });
    }
    await tx.auditLog.create({
      data: { entity: "RatePlan", entityId: next.id, action: "revise", userId: actorId, diff: { from: old.id, effective, ...JSON.parse(JSON.stringify(input)) } },
    });
    return { planId: next.id, effective };
  });
}

/** Назначить педагогу шаблон — с 1-го числа следующего месяца или позже. */
export async function assignPlan(db: RootDb, actorId: string, teacherId: string, planId: string, from: LocalDate, today: LocalDate) {
  const start = firstOfMonthOf(from);
  if (start < nextMonthStart(today)) throw new DomainError("Ставка меняется с 1-го числа следующего месяца или позже");
  const plan = await db.ratePlan.findUnique({ where: { id: planId } });
  if (!plan || plan.isArchived) throw new DomainError("Шаблон не найден");
  await db.$transaction([
    db.teacherRatePlan.upsert({
      where: { teacherId_validFrom: { teacherId, validFrom: toDbDate(start) } },
      create: { teacherId, planId, validFrom: toDbDate(start) },
      update: { planId },
    }),
    db.auditLog.create({ data: { entity: "Teacher", entityId: teacherId, action: "assignPlan", userId: actorId, diff: { planId, from: start } } }),
  ]);
  return { from: start };
}

/** История ставок педагога: какой шаблон с какого месяца. */
export async function planHistory(db: Db, teacherId: string) {
  const rows = await db.teacherRatePlan.findMany({
    where: { teacherId },
    orderBy: { validFrom: "desc" },
    include: { plan: { include: { tiers: { orderBy: { thresholdHours: "asc" } } } } },
  });
  return rows.map((r) => ({
    validFrom: fromDbDate(r.validFrom),
    planId: r.planId,
    name: r.plan.name,
    baseAmount: r.plan.baseAmount,
    groupPerStudent: r.plan.groupPerStudent,
    trialFixed: r.plan.trialFixed,
    payForUnexcused: r.plan.payForUnexcused,
    bonusApply: r.plan.bonusApply,
    tiers: r.plan.tiers.map((t) => ({ thresholdHours: Number(t.thresholdHours), bonusPercent: Number(t.bonusPercent) })),
  }));
}

/** Действующий на сегодня шаблон школы по умолчанию — для новых педагогов. */
export async function defaultPlan(db: Db) {
  return db.ratePlan.findFirst({ where: { isDefault: true }, orderBy: { versionFrom: "desc" } });
}
