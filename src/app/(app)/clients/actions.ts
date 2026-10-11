"use server";

import { z } from "zod";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { createTelegramInvite } from "@/server/messaging/outbox";
import { requirePermission } from "@/server/session";

const phone = z
  .string()
  .trim()
  .min(5, "Укажите телефон")
  .max(30)
  .regex(/^[\d\s()+\-]+$/, "Телефон: только цифры, пробелы, скобки, «+» и «-»");

const clientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Укажите фамилию и имя")
    .max(120)
    .refine((v) => v.split(/\s+/).length >= 2, "Укажите фамилию и имя через пробел"),
  gender: z.enum(["MALE", "FEMALE"]).nullable(),
  fullNameGen: z.string().trim().max(120).nullish(),
  grade: z.number().int().min(1).max(11).nullable(),
  school: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(30).nullish(),
  program: z.enum(["EXAM", "SCHOOL"]),
  paymentMode: z.enum(["MONTHLY", "PER_LESSON"]),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).default("ACTIVE"),
  goal: z.string().trim().max(500).nullish(),
  source: z.enum(["SITE", "AVITO", "VK", "REFERRAL", "OTHER"]).nullable(),
  notes: z.string().trim().max(5000).nullish(),
  parents: z
    .array(
      z.object({
        id: z.string().optional(),
        fullName: z.string().trim().min(2, "Укажите ФИО родителя").max(120),
        relation: z.string().trim().max(40).nullish(),
        phone,
      }),
    )
    .min(1, "Добавьте хотя бы одного родителя или контактное лицо"),
});

export type ClientPayload = z.input<typeof clientSchema>;

const empty = (v: string | null | undefined) => (v ? v : null);

/** Создать или изменить ученика вместе с родителями. Первый в списке родитель — основной контакт. */
export async function saveClientAction(clientId: string | null, payload: ClientPayload): Promise<Result<{ id: string }>> {
  const user = await requirePermission(clientId ? "clients.edit" : "clients.create");
  return runAction(async () => {
    const p = clientSchema.parse(payload);
    const data = {
      fullName: p.fullName,
      gender: p.gender,
      fullNameGen: empty(p.fullNameGen),
      grade: p.grade,
      school: empty(p.school),
      phone: empty(p.phone),
      program: p.program,
      paymentMode: p.paymentMode,
      status: p.status,
      goal: empty(p.goal),
      source: p.source,
      notes: empty(p.notes),
    };
    const id = await prisma.$transaction(async (tx) => {
      const client = clientId
        ? await tx.client.update({ where: { id: clientId }, data })
        : await tx.client.create({ data });
      const keep = p.parents.filter((x) => x.id).map((x) => x.id!);
      await tx.parent.deleteMany({ where: { clientId: client.id, id: { notIn: keep } } });
      for (const [i, parent] of p.parents.entries()) {
        const pd = { fullName: parent.fullName, relation: empty(parent.relation), phone: parent.phone, isPrimary: i === 0 };
        if (parent.id) await tx.parent.update({ where: { id: parent.id, clientId: client.id }, data: pd });
        else await tx.parent.create({ data: { ...pd, clientId: client.id } });
      }
      await tx.auditLog.create({
        data: { entity: "Client", entityId: client.id, action: clientId ? "update" : "create", userId: user.id, diff: data },
      });
      return client.id;
    });
    revalidateBilling();
    return { ok: true, message: clientId ? "Изменения сохранены" : "Ученик добавлен", data: { id } };
  });
}

/** Массовая смена статуса: пауза, архив, вернуть в активные. */
export async function setClientsStatusAction(ids: string[], status: "ACTIVE" | "PAUSED" | "ARCHIVED"): Promise<Result> {
  const user = await requirePermission("clients.edit");
  return runAction(async () => {
    const list = z.array(z.string().min(1)).min(1, "Выберите учеников").parse(ids);
    const s = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).parse(status);
    const { count } = await prisma.client.updateMany({ where: { id: { in: list } }, data: { status: s } });
    await prisma.auditLog.createMany({
      data: list.map((entityId) => ({ entity: "Client", entityId, action: "status", userId: user.id, diff: { status: s } })),
    });
    revalidateBilling();
    const label = { ACTIVE: "активные", PAUSED: "на паузу", ARCHIVED: "в архив" }[s];
    return { ok: true, message: `Перенесено ${label}: ${count}` };
  });
}

/** Ссылка-приглашение в Telegram-бот для родителя. */
export async function telegramInviteAction(parentId: string): Promise<Result<{ link: string | null; code: string }>> {
  await requirePermission("clients.edit");
  return runAction(async () => {
    const parent = await prisma.parent.findUnique({ where: { id: z.string().min(1).parse(parentId) } });
    if (!parent) throw new DomainError("Родитель не найден");
    const invite = await createTelegramInvite(prisma, parent.id);
    return {
      ok: true,
      message: invite.link ? "Ссылка готова — отправьте её родителю" : "Бот ещё не настроен: ссылка появится после указания токена",
      data: invite,
    };
  });
}
