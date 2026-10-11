import { fromDbDate, toDbDate, type LocalDate } from "@/domain/calendar";
import { DomainError } from "./errors";
import type { Db } from "./lessons/context";

type RootDb = Extract<Db, { $transaction: unknown }>;

/** Статьи расходов по умолчанию; можно добавлять свои — они появятся в списке после первой записи. */
export const DEFAULT_EXPENSE_CATEGORIES = ["Аренда", "Реклама", "Материалы", "Связь и сервисы", "Налоги", "Прочее"];

export async function expenseCategories(db: Db) {
  const used = await db.expense.findMany({ distinct: ["category"], select: { category: true } });
  return [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...used.map((u) => u.category)])];
}

export async function listExpenses(db: Db, from: LocalDate, to: LocalDate, category?: string) {
  const rows = await db.expense.findMany({
    where: { date: { gte: toDbDate(from), lte: toDbDate(to) }, ...(category ? { category } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const active = rows.filter((r) => !r.cancelledAt);
  const byCategory = new Map<string, number>();
  for (const r of active) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount);
  return {
    total: active.reduce((s, r) => s + r.amount, 0),
    byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    rows: rows.map((r) => ({
      id: r.id,
      date: fromDbDate(r.date),
      category: r.category,
      amount: r.amount,
      comment: r.comment,
      author: r.createdBy?.name ?? null,
      cancelled: r.cancelledAt ? (r.cancelReason ?? "отменён") : null,
    })),
  };
}

export async function addExpense(db: RootDb, actorId: string, input: { category: string; amount: number; date: LocalDate; comment?: string | null }) {
  if (!input.category.trim()) throw new DomainError("Укажите статью расхода");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new DomainError("Сумма должна быть больше нуля");
  const e = await db.expense.create({
    data: { category: input.category.trim(), amount: input.amount, date: toDbDate(input.date), comment: input.comment?.trim() || null, createdById: actorId },
  });
  await db.auditLog.create({ data: { entity: "Expense", entityId: e.id, action: "create", userId: actorId, diff: { amount: input.amount, category: input.category } } });
  return e;
}

/** Ошибочный расход не удаляется — отменяется с причиной. */
export async function cancelExpense(db: RootDb, actorId: string, id: string, reason: string) {
  if (!reason.trim()) throw new DomainError("Укажите причину");
  const e = await db.expense.findUnique({ where: { id } });
  if (!e || e.cancelledAt) throw new DomainError("Расход не найден");
  await db.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await db.auditLog.create({ data: { entity: "Expense", entityId: id, action: "cancel", userId: actorId, diff: { reason } } });
}


