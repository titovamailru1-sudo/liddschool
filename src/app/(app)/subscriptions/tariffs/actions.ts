"use server";

import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { formatLocalDate, formatRub } from "@/domain/format";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import {
  clientTariffOptions,
  createTariff,
  deleteTariff,
  deleteTariffPrice,
  setTariffPrice,
  updateTariff,
  type ClientTariffOption,
} from "@/server/billing/tariffs";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");
const price = z.number({ message: "Укажите цену" }).int("Цена — целое число рублей").positive("Цена должна быть больше нуля").max(100_000);
const attrs = z.object({
  name: z.string().trim().min(1, "Укажите название тарифа").max(80),
  kind: z.enum(["INDIVIDUAL", "GROUP"]),
  program: z.enum(["EXAM", "SCHOOL"]),
  paymentMode: z.enum(["MONTHLY", "PER_LESSON"]),
});

export async function createTariffAction(payload: z.input<typeof attrs> & { pricePerHour: number; validFrom: string }): Promise<Result> {
  const user = await requirePermission("tariffs.manage");
  return runAction(async () => {
    const p = attrs.extend({ pricePerHour: price, validFrom: date }).parse(payload);
    await createTariff(prisma, user.id, p);
    revalidateBilling();
    return { ok: true, message: `Тариф «${p.name}» создан` };
  });
}

export async function updateTariffAction(id: string, payload: z.input<typeof attrs>): Promise<Result> {
  const user = await requirePermission("tariffs.manage");
  return runAction(async () => {
    await updateTariff(prisma, user.id, z.string().min(1).parse(id), attrs.parse(payload));
    revalidateBilling();
    return { ok: true, message: "Тариф сохранён" };
  });
}

export async function setTariffPriceAction(tariffId: string, payload: { pricePerHour: number; validFrom: string }): Promise<Result> {
  const user = await requirePermission("tariffs.manage");
  return runAction(async () => {
    const p = z.object({ pricePerHour: price, validFrom: date }).parse(payload);
    await setTariffPrice(prisma, user.id, z.string().min(1).parse(tariffId), p.pricePerHour, p.validFrom, localDateOf(now()));
    revalidateBilling();
    return { ok: true, message: `Цена ${formatRub(p.pricePerHour)} с ${formatLocalDate(p.validFrom)}` };
  });
}

export async function deleteTariffPriceAction(priceId: string): Promise<Result> {
  const user = await requirePermission("tariffs.manage");
  return runAction(async () => {
    await deleteTariffPrice(prisma, user.id, z.string().min(1).parse(priceId), localDateOf(now()));
    revalidateBilling();
    return { ok: true, message: "Цена удалена" };
  });
}

export async function deleteTariffAction(id: string): Promise<Result> {
  const user = await requirePermission("tariffs.manage");
  return runAction(async () => {
    await deleteTariff(prisma, user.id, z.string().min(1).parse(id));
    revalidateBilling();
    return { ok: true, message: "Тариф удалён" };
  });
}

/** Варианты тарифа для формы ученика. */
export async function clientTariffOptionsAction(): Promise<ClientTariffOption[]> {
  await requirePermission("clients.edit");
  return clientTariffOptions(prisma, localDateOf(now()));
}
