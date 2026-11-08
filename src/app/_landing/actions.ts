"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { createSiteLead } from "@/server/leads/service";
import { reportError } from "@/server/alerts";
import { createLimiter } from "@/server/rate-limit";

// Заявки с одного адреса: не больше 5 в час (защита от спама).
const perIp = createLimiter({ max: 5, windowMs: 60 * 60_000 });

const schema = z.object({
  childName: z.string().trim().min(2, "Укажите имя ребёнка").max(80),
  grade: z.coerce.number().int().min(1).max(11).nullable(),
  subject: z.enum(["математика", "информатика", "математика и информатика"]),
  program: z.enum(["EXAM", "SCHOOL"]),
  parentName: z.string().trim().max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[\d\s()+\-]+$/, "Телефон: только цифры")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Проверьте номер телефона"),
  preferredTime: z.string().trim().max(120).optional(),
  consent: z.literal(true, { message: "Нужно согласие на обработку персональных данных" }),
});

export type TrialRequest = z.input<typeof schema> & { website?: string; startedAt: number };
export type TrialResult = { ok: true } | { ok: false; error: string };

/** Заявка на бесплатный пробный урок с главной страницы → лид «Сайт» и задача администратору. */
export async function requestTrialAction(payload: TrialRequest): Promise<TrialResult> {
  // Скрытое поле заполняют только боты; форму быстрее 3 секунд тоже отправляет не человек. Боту отвечаем «успех».
  if (payload.website || Date.now() - payload.startedAt < 3_000) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (perIp.retryAfter(ip)) return { ok: false, error: "Слишком много заявок. Попробуйте позже или позвоните нам." };

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  const p = parsed.data;
  perIp.fail(ip);
  try {
    await createSiteLead(
      prisma,
      {
        childName: p.childName,
        grade: p.grade,
        subject: p.subject,
        program: p.program,
        parentName: p.parentName,
        phone: p.phone,
        preferredTime: p.preferredTime,
      },
      now(),
    );
  } catch (e) {
    await reportError("web", e, "заявка с сайта");
    return { ok: false, error: "Не удалось отправить заявку. Позвоните или напишите нам — контакты ниже." };
  }
  return { ok: true };
}
