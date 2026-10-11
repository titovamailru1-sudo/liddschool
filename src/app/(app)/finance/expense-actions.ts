"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatRub } from "@/domain/format";
import { runAction, type Result } from "@/server/action-result";
import { prisma } from "@/server/db";
import { addExpense, cancelExpense } from "@/server/expenses";
import { requirePermission } from "@/server/session";

const schema = z.object({
  category: z.string().trim().min(1, "Укажите статью").max(60),
  amount: z.number().int().positive("Сумма должна быть больше нуля"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"),
  comment: z.string().max(300).nullish(),
});

export async function addExpenseAction(payload: z.input<typeof schema>): Promise<Result> {
  const user = await requirePermission("finance.expenses");
  return runAction(async () => {
    const p = schema.parse(payload);
    await addExpense(prisma, user.id, p);
    revalidatePath("/finance");
    return { ok: true, message: `Расход ${formatRub(p.amount)} добавлен` };
  });
}

export async function cancelExpenseAction(id: string, reason: string): Promise<Result> {
  const user = await requirePermission("finance.expenses");
  return runAction(async () => {
    await cancelExpense(prisma, user.id, id, reason);
    revalidatePath("/finance");
    return { ok: true, message: "Расход отменён" };
  });
}
