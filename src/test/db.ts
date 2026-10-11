import { PrismaClient } from "@prisma/client";
import { toDbDate } from "@/domain/calendar";

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
  await testDb.tariff.createMany({
    data: [
      { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 1500, validFrom },
      { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "PER_LESSON", pricePerHour: 1700, validFrom },
      { kind: "INDIVIDUAL", program: "SCHOOL", paymentMode: "MONTHLY", pricePerHour: 1300, validFrom },
      { kind: "INDIVIDUAL", program: "SCHOOL", paymentMode: "PER_LESSON", pricePerHour: 1500, validFrom },
      { kind: "GROUP", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 800, validFrom },
      { kind: "GROUP", program: "EXAM", paymentMode: "PER_LESSON", pricePerHour: 1000, validFrom },
      { kind: "GROUP", program: "SCHOOL", paymentMode: "MONTHLY", pricePerHour: 800, validFrom },
      { kind: "GROUP", program: "SCHOOL", paymentMode: "PER_LESSON", pricePerHour: 1000, validFrom },
    ],
  });
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
