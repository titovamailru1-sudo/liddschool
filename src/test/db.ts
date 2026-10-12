import { PrismaClient, type PaymentMode, type Program, type TariffKind } from "@prisma/client";
import { toDbDate } from "@/domain/calendar";
import { defaultTariffName } from "@/domain/pricing";

/** Клиент тестовой базы (DATABASE_URL подменяется в vitest.config.mts). */
export const testDb = new PrismaClient();

/** Очистить все таблицы. */
export async function resetDb() {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await testDb.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

/** Минимальный набор данных: пользователь, педагог, тарифы, шаблон ставки. */
export async function seedBasics() {
  const admin = await testDb.user.create({
    data: { email: "admin@test", name: "Админ", role: "ADMIN", passwordHash: "x" },
  });
  const teacher = await testDb.teacher.create({
    data: { fullName: "Петрова Анна", color: "#8A88EE", subjects: ["математика"], onlineUrl: "https://meet.test/petrova" },
  });
  const teacher2 = await testDb.teacher.create({
    data: { fullName: "Ким Денис", color: "#45B48C", subjects: ["информатика"] },
  });
  const validFrom = toDbDate("2026-01-01");
  const prices: [TariffKind, Program, PaymentMode, number][] = [
    ["INDIVIDUAL", "EXAM", "MONTHLY", 1500],
    ["INDIVIDUAL", "EXAM", "PER_LESSON", 1700],
    ["INDIVIDUAL", "SCHOOL", "MONTHLY", 1300],
    ["INDIVIDUAL", "SCHOOL", "PER_LESSON", 1500],
    ["GROUP", "EXAM", "MONTHLY", 800],
    ["GROUP", "EXAM", "PER_LESSON", 1000],
    ["GROUP", "SCHOOL", "MONTHLY", 800],
    ["GROUP", "SCHOOL", "PER_LESSON", 1000],
  ];
  for (const [kind, program, paymentMode, pricePerHour] of prices) {
    await testDb.tariff.create({
      data: {
        kind,
        program,
        paymentMode,
        name: defaultTariffName({ kind, program, paymentMode }),
        isDefault: true,
        prices: { create: { pricePerHour, validFrom } },
      },
    });
  }
  await testDb.ratePlan.create({
    data: {
      name: "Шаблон",
      isDefault: true,
      tiers: { create: [{ thresholdHours: 30, bonusPercent: 10 }, { thresholdHours: 45, bonusPercent: 15 }] },
    },
  });
  const perLesson = await testDb.client.create({
    data: { fullName: "Соколова Алиса", program: "EXAM", paymentMode: "PER_LESSON" },
  });
  const monthly = await testDb.client.create({
    data: { fullName: "Иванов Миша", program: "EXAM", paymentMode: "MONTHLY" },
  });
  return { admin, teacher, teacher2, perLesson, monthly, actor: { userId: admin.id } };
}

/** Баланс клиента = сумма записей журнала. */
export async function balanceOf(clientId: string) {
  const r = await testDb.ledgerEntry.aggregate({ where: { clientId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
