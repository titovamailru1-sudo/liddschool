import type { Prisma, PrismaClient } from "@prisma/client";
import {
  addDays,
  firstOfMonth,
  fromDbDate,
  localDateOf,
  parseLocalDate,
  startOfDay,
  toDbDate,
  type LocalDate,
} from "@/domain/calendar";
import type { PaymentMode } from "@/domain/constants";
import type { RatePlanInput } from "@/domain/payroll";
import { rateFor, type TariffRow } from "@/domain/pricing";
import type { SettlementStudent } from "@/domain/lessonSettlement";
import { DomainError } from "../errors";

/** Клиент БД или транзакция — сервисы работают с обоими. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Все цены всех тарифов (история по датам) — для расчёта цены на дату урока. */
export async function loadTariffs(db: Db): Promise<TariffRow[]> {
  const rows = await db.tariffPrice.findMany({ include: { tariff: true } });
  return rows.map((p) => ({
    tariffId: p.tariffId,
    name: p.tariff.name,
    isDefault: p.tariff.isDefault,
    kind: p.tariff.kind,
    program: p.tariff.program,
    paymentMode: p.tariff.paymentMode,
    pricePerHour: p.pricePerHour,
    validFrom: fromDbDate(p.validFrom),
  }));
}

/**
 * Ставка педагога на месяц урока. Ставка меняется только с 1-го числа, поэтому берём назначение,
 * действующее на 1-е число месяца; если назначений нет — шаблон школы.
 */
export async function loadRatePlan(db: Db, teacherId: string, on: LocalDate): Promise<RatePlanInput> {
  const { year, month } = parseLocalDate(on);
  const assignment = await db.teacherRatePlan.findFirst({
    where: { teacherId, validFrom: { lte: toDbDate(firstOfMonth(year, month)) } },
    orderBy: { validFrom: "desc" },
    include: { plan: { include: { tiers: true } } },
  });
  // Запасной вариант — версия шаблона школы, действовавшая в этом месяце (не будущая).
  const defaultFamily = assignment ? null : await db.ratePlan.findFirst({ where: { isDefault: true }, select: { familyId: true, id: true } });
  const plan =
    assignment?.plan ??
    (defaultFamily
      ? await db.ratePlan.findFirst({
          where: {
            OR: [{ id: defaultFamily.id }, { familyId: defaultFamily.familyId ?? defaultFamily.id }],
            AND: [{ OR: [{ versionFrom: null }, { versionFrom: { lte: toDbDate(firstOfMonth(year, month)) } }] }],
          },
          orderBy: { versionFrom: { sort: "desc", nulls: "last" } },
          include: { tiers: true },
        })
      : null);
  if (!plan) throw new DomainError("Не настроен шаблон ставки школы");
  return {
    baseAmount: plan.baseAmount,
    groupPerStudent: plan.groupPerStudent,
    trialFixed: plan.trialFixed,
    payForUnexcused: plan.payForUnexcused,
    bonusApply: plan.bonusApply,
    tiers: plan.tiers.map((t) => ({ thresholdHours: Number(t.thresholdHours), bonusPercent: Number(t.bonusPercent) })),
  };
}

export interface LessonStudentsSource {
  id: string;
  startsAt: Date;
  program: "EXAM" | "SCHOOL";
  clientId: string | null;
  groupId: string | null;
}

export interface LessonStudent extends SettlementStudent {
  fullName: string;
}

/**
 * Ученики урока с тарифом на дату урока: для индивидуального — сам ученик,
 * для группы — участники, состоявшие в группе на момент урока, плюс уже отмеченные ранее.
 */
export async function loadLessonStudents(
  db: Db,
  lesson: LessonStudentsSource,
  tariffs?: TariffRow[],
): Promise<LessonStudent[]> {
  const allTariffs = tariffs ?? (await loadTariffs(db));
  const on = localDateOf(lesson.startsAt);

  let clients: { id: string; fullName: string; paymentMode: PaymentMode; tariffId: string | null }[] = [];
  if (lesson.clientId) {
    const c = await db.client.findUniqueOrThrow({
      where: { id: lesson.clientId },
      select: { id: true, fullName: true, paymentMode: true, tariffId: true },
    });
    clients = [c];
  } else if (lesson.groupId) {
    const members = await db.groupMember.findMany({
      where: {
        groupId: lesson.groupId,
        joinedAt: { lt: startOfDay(addDays(on, 1)) }, // вступил в любой момент дня урока
        OR: [{ leftAt: null }, { leftAt: { gt: lesson.startsAt } }],
      },
      select: { client: { select: { id: true, fullName: true, paymentMode: true, tariffId: true } } },
    });
    const marked = await db.attendance.findMany({
      where: { lessonId: lesson.id },
      select: { client: { select: { id: true, fullName: true, paymentMode: true, tariffId: true } } },
    });
    const byId = new Map([...members, ...marked].map((m) => [m.client.id, m.client]));
    clients = [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  }

  const kind = lesson.groupId ? "GROUP" : "INDIVIDUAL";
  return clients.map((c) => ({
    clientId: c.id,
    fullName: c.fullName,
    paymentMode: c.paymentMode,
    // Свой тариф ученика действует на индивидуальные уроки; групповые — по групповому тарифу школы.
    pricePerHour: rateFor(allTariffs, { kind, program: lesson.program, paymentMode: c.paymentMode }, on, kind === "INDIVIDUAL" ? c.tariffId : null),
  }));
}
