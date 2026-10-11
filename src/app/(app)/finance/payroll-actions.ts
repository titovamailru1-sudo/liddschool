"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { formatRub } from "@/domain/format";
import { runAction, type Result } from "@/server/action-result";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { addPayrollAdjustment, addPayrollPayment, cancelPayrollPayment, closePayrollMonth } from "@/server/payroll/payroll";
import { requirePermission } from "@/server/session";

const target = z.object({ teacherId: z.string().min(1), year: z.number().int(), month: z.number().int().min(1).max(12) });

function revalidatePayroll() {
  revalidatePath("/finance");
  revalidatePath("/teachers", "layout");
}

export async function payrollAdjustmentAction(
  t: z.input<typeof target>,
  amount: number,
  reason: string,
): Promise<Result> {
  const user = await requirePermission("finance.payroll");
  return runAction(async () => {
    const { teacherId, year, month } = target.parse(t);
    await addPayrollAdjustment(prisma, user.id, teacherId, year, month, z.number().int().parse(amount), reason);
    revalidatePayroll();
    return { ok: true, message: amount > 0 ? `Премия ${formatRub(amount)} добавлена` : `Штраф ${formatRub(-amount)} добавлен` };
  });
}

const paymentSchema = z.object({
  amount: z.number().int().positive("Сумма должна быть больше нуля"),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isAdvance: z.boolean(),
  comment: z.string().max(300).nullish(),
});

export async function payrollPaymentAction(t: z.input<typeof target>, payload: z.input<typeof paymentSchema>): Promise<Result> {
  const user = await requirePermission("finance.payroll");
  return runAction(async () => {
    const { teacherId, year, month } = target.parse(t);
    const p = paymentSchema.parse(payload);
    await addPayrollPayment(
      prisma,
      user.id,
      teacherId,
      year,
      month,
      { amount: p.amount, paidAt: new Date(`${p.paidAt}T02:00:00Z`), isAdvance: p.isAdvance, comment: p.comment },
      localDateOf(now()),
    );
    revalidatePayroll();
    return { ok: true, message: `${p.isAdvance ? "Аванс" : "Выплата"} ${formatRub(p.amount)} отмечен${p.isAdvance ? "" : "а"}` };
  });
}

export async function cancelPayrollPaymentAction(paymentId: string, reason: string): Promise<Result> {
  const user = await requirePermission("finance.payroll");
  return runAction(async () => {
    await cancelPayrollPayment(prisma, user.id, z.string().min(1).parse(paymentId), reason, localDateOf(now()));
    revalidatePayroll();
    return { ok: true, message: "Выплата отменена" };
  });
}

export async function closePayrollMonthAction(teacherIds: string[], year: number, month: number): Promise<Result> {
  const user = await requirePermission("finance.payroll");
  return runAction(async () => {
    const ids = z.array(z.string().min(1)).min(1).parse(teacherIds);
    let unmarked = 0;
    for (const id of ids) unmarked += (await closePayrollMonth(prisma, user.id, id, year, month, localDateOf(now()))).unmarked;
    revalidatePayroll();
    return {
      ok: true,
      message: `Месяц закрыт: ${ids.length}` + (unmarked ? `. Внимание: неотмеченных уроков — ${unmarked}, их отметка попадёт в перерасчёт` : ""),
    };
  });
}
