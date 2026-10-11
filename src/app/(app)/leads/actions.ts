"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { runAction, type Result } from "@/server/action-result";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { addLeadTouch, convertLead, createLead, leadOffer, leadTouches, scheduleTrial, setLeadStage, updateLead } from "@/server/leads/service";
import type { ConflictView } from "@/server/lessons/service";
import { requirePermission } from "@/server/session";

const leadSchema = z.object({
  childName: z.string().trim().min(2, "Укажите имя ребёнка").max(120),
  grade: z.number().int().min(1).max(11).nullable(),
  parentName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().min(5, "Укажите телефон").max(30),
  source: z.enum(["SITE", "AVITO", "VK", "REFERRAL", "OTHER"]),
  subject: z.string().trim().max(60).nullish(),
  program: z.enum(["EXAM", "SCHOOL"]).nullable(),
  goal: z.string().trim().max(300).nullish(),
  preferredTime: z.string().trim().max(120).nullish(),
  comment: z.string().trim().max(2000).nullish(),
  ownerId: z.string().nullish(),
});

export type LeadPayload = z.input<typeof leadSchema>;

function revalidateLeads() {
  revalidatePath("/leads");
  revalidatePath("/lessons");
  revalidatePath("/tasks");
}

export async function saveLeadAction(leadId: string | null, payload: LeadPayload): Promise<Result<{ id: string }>> {
  const user = await requirePermission("leads.view");
  return runAction(async () => {
    const p = leadSchema.parse(payload);
    if (leadId) {
      await updateLead(prisma, user.id, leadId, p);
      revalidateLeads();
      return { ok: true, message: "Сохранено", data: { id: leadId } };
    }
    const lead = await createLead(prisma, user.id, p);
    revalidateLeads();
    return { ok: true, message: "Заявка добавлена", data: { id: lead.id } };
  });
}

export async function leadTouchesAction(leadId: string) {
  await requirePermission("leads.view");
  return leadTouches(prisma, leadId);
}

export async function addTouchAction(leadId: string, kind: "call" | "message" | "note", text: string): Promise<Result> {
  const user = await requirePermission("leads.view");
  return runAction(async () => {
    await addLeadTouch(prisma, user.id, leadId, z.enum(["call", "message", "note"]).parse(kind), text);
    revalidateLeads();
    return { ok: true, message: "Касание записано" };
  });
}

export async function setStageAction(leadId: string, stage: string, lostReason?: string): Promise<Result> {
  const user = await requirePermission("leads.view");
  return runAction(async () => {
    const s = z.enum(["NEW", "CONTACTED", "TRIAL_SCHEDULED", "TRIAL_DONE", "WON", "LOST"]).parse(stage);
    await setLeadStage(prisma, user.id, leadId, s, lostReason);
    revalidateLeads();
    return { ok: true, message: "Этап изменён" };
  });
}

const trialSchema = z.object({
  teacherId: z.string().min(1, "Выберите педагога"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Укажите время"),
  durationMin: z.number().int().min(15).max(180),
  subject: z.string().trim().min(1).max(60),
});

export async function scheduleTrialAction(leadId: string, payload: z.input<typeof trialSchema>): Promise<Result<{ conflicts?: ConflictView[] }>> {
  const user = await requirePermission("lessons.create");
  return runAction(async () => {
    const r = await scheduleTrial(prisma, user.id, leadId, trialSchema.parse(payload));
    if (!r.ok) return { ok: false, error: "Педагог в это время занят" };
    revalidateLeads();
    return { ok: true, message: "Пробный урок назначен — он в расписании педагога" };
  });
}

export async function offerAction(leadId: string, slots: { weekday: number; durationMin: number }[]) {
  await requirePermission("leads.view");
  return runAction(async () => {
    const s = z.array(z.object({ weekday: z.number().int().min(1).max(7), durationMin: z.number().int().min(15).max(180) })).min(1, "Выберите дни").parse(slots);
    return { ok: true as const, data: await leadOffer(prisma, leadId, s, localDateOf(now())) };
  });
}

const convertSchema = z.object({
  fullName: z.string().trim().min(3, "Фамилия и имя ученика"),
  gender: z.enum(["MALE", "FEMALE"]).nullable(),
  grade: z.number().int().min(1).max(11).nullable(),
  program: z.enum(["EXAM", "SCHOOL"]),
  paymentMode: z.enum(["MONTHLY", "PER_LESSON"]),
  parentName: z.string().trim().min(2, "ФИО родителя"),
  parentPhone: z.string().trim().min(5, "Телефон родителя"),
});

export async function convertLeadAction(leadId: string, payload: z.input<typeof convertSchema>): Promise<Result<{ clientId: string }>> {
  const user = await requirePermission("clients.create");
  return runAction(async () => {
    const r = await convertLead(prisma, user.id, leadId, convertSchema.parse(payload));
    revalidateLeads();
    revalidatePath("/clients", "layout");
    return { ok: true, message: "Ученик добавлен в клиенты", data: r };
  });
}
