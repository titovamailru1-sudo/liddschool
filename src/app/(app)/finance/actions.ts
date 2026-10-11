"use server";

import { z } from "zod";
import { formatRub } from "@/domain/format";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import { acceptPayment, adjustBalance, cancelPayment } from "@/server/billing/payments";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";

const amount = z.number({ message: "Укажите сумму" }).int("Сумма в целых рублях").positive("Сумма должна быть больше нуля");

const acceptSchema = z.object({
  clientId: z.string().min(1, "Выберите клиента"),
  amount,
  method: z.enum(["CASH", "CARD", "TRANSFER", "SBP", "ONLINE"]),
  invoiceId: z.string().nullish(),
  lessonId: z.string().nullish(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  comment: z.string().max(500).nullish(),
});

export type AcceptPaymentPayload = z.input<typeof acceptSchema>;

export async function acceptPaymentAction(payload: AcceptPaymentPayload): Promise<Result<{ balance: number }>> {
  const user = await requirePermission("finance.payments");
  return runAction(async () => {
    const p = acceptSchema.parse(payload);
    const r = await acceptPayment(prisma, user.id, {
      ...p,
      // Дата оплаты — полдень по Владивостоку, чтобы день не «съезжал» при переводе в UTC.
      paidAt: p.paidAt ? new Date(`${p.paidAt}T02:00:00Z`) : undefined,
    });
    revalidateBilling();
    return { ok: true, message: `Оплата ${formatRub(p.amount)} принята. Баланс: ${formatRub(r.balance)}`, data: { balance: r.balance } };
  });
}

export async function cancelPaymentAction(paymentId: string, reason: string): Promise<Result> {
  const user = await requirePermission("finance.payments");
  return runAction(async () => {
    const r = await cancelPayment(prisma, user.id, z.string().min(1).parse(paymentId), reason);
    revalidateBilling();
    return { ok: true, message: `Платёж отменён. Баланс: ${formatRub(r.balance)}` };
  });
}

const adjustSchema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["REFUND", "ADJUSTMENT"]),
  amount: z.number().int().refine((v) => v !== 0, "Укажите сумму"),
  comment: z.string().trim().min(1, "Комментарий обязателен").max(500),
});

export async function adjustBalanceAction(payload: z.input<typeof adjustSchema>): Promise<Result> {
  const user = await requirePermission("finance.payments");
  return runAction(async () => {
    const r = await adjustBalance(prisma, user.id, adjustSchema.parse(payload));
    revalidateBilling();
    return { ok: true, message: `Сохранено. Баланс: ${formatRub(r.balance)}` };
  });
}
