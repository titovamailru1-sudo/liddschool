"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import { saveSetting } from "@/server/billing/settings";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { runJobs } from "@/server/jobs";
import { messageSender } from "@/server/messaging/telegram";
import { requirePermission } from "@/server/session";

const payeeSchema = z.object({
  name: z.string().trim().min(2, "Укажите получателя").max(200),
  payeeInn: z.string().trim().regex(/^(\d{10}|\d{12})?$/, "ИНН — 10 или 12 цифр").optional(),
  bankName: z.string().trim().min(2, "Укажите банк").max(200),
  bic: z.string().trim().regex(/^\d{9}$/, "БИК — 9 цифр"),
  personalAcc: z.string().trim().regex(/^\d{20}$/, "Расчётный счёт — 20 цифр"),
  correspAcc: z.string().trim().regex(/^\d{20}$/, "Корр. счёт — 20 цифр"),
  sbpPhone: z.string().trim().max(30).optional(),
});

export async function savePayeeAction(payload: z.input<typeof payeeSchema>): Promise<Result> {
  const user = await requirePermission("settings.manage");
  return runAction(async () => {
    const p = payeeSchema.parse(payload);
    await saveSetting(prisma, "payee", p);
    await prisma.auditLog.create({ data: { entity: "Setting", entityId: "payee", action: "update", userId: user.id } });
    revalidatePath("/settings");
    return { ok: true, message: "Реквизиты сохранены" };
  });
}

/** Запустить фоновые задачи вручную (обычно их выполняет `npm run worker` раз в минуту). */
export async function runJobsAction(): Promise<Result<Record<string, unknown>>> {
  await requirePermission("settings.manage");
  return runAction(async () => {
    const r = await runJobs(prisma, now(), messageSender());
    revalidateBilling();
    revalidatePath("/settings");
    return { ok: true, message: "Фоновые задачи выполнены", data: r };
  });
}
