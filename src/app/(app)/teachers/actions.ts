"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { runAction, type Result } from "@/server/action-result";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { assignPlan, createPlan, revisePlan } from "@/server/payroll/rates";
import { createTeacher, teacherInvite, updateTeacher } from "@/server/payroll/teachers";
import { requirePermission } from "@/server/session";

const teacherSchema = z.object({
  fullName: z.string().trim().min(3, "Укажите фамилию и имя").max(120),
  phone: z.string().trim().max(30).nullish(),
  email: z.union([z.literal(""), z.email("Некорректный email")]).nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Выберите цвет"),
  subjects: z.array(z.string().trim().min(1)).max(10),
  onlineUrl: z.union([z.literal(""), z.url("Ссылка должна начинаться с https://")]).nullish(),
});

export type TeacherPayload = z.input<typeof teacherSchema>;

function revalidateTeachers() {
  revalidatePath("/teachers", "layout");
  revalidatePath("/finance");
  revalidatePath("/lessons");
}

export async function createTeacherAction(payload: TeacherPayload): Promise<Result<{ id: string; inviteLink: string | null }>> {
  const user = await requirePermission("teachers.create");
  return runAction(async () => {
    const r = await createTeacher(prisma, user.id, teacherSchema.parse(payload), localDateOf(now()));
    revalidateTeachers();
    return {
      ok: true,
      message: r.inviteLink ? "Педагог добавлен — отправьте ему ссылку для входа" : "Педагог добавлен",
      data: { id: r.teacherId, inviteLink: r.inviteLink },
    };
  });
}

export async function updateTeacherAction(teacherId: string, payload: TeacherPayload & { isActive: boolean }): Promise<Result> {
  const user = await requirePermission("teachers.edit");
  return runAction(async () => {
    await updateTeacher(prisma, user.id, z.string().min(1).parse(teacherId), {
      ...teacherSchema.parse(payload),
      isActive: z.boolean().parse(payload.isActive),
    });
    revalidateTeachers();
    return { ok: true, message: "Сохранено" };
  });
}

export async function teacherInviteAction(teacherId: string, email?: string): Promise<Result<{ link: string }>> {
  const user = await requirePermission("teachers.edit");
  return runAction(async () => {
    const r = await teacherInvite(prisma, user.id, teacherId, email);
    revalidateTeachers();
    return { ok: true, message: "Ссылка готова — отправьте её педагогу", data: r };
  });
}

// ── Шаблоны ставок (только владелец) ──

const planSchema = z.object({
  name: z.string().trim().min(2, "Укажите название").max(100),
  baseAmount: z.number().int().min(0),
  groupPerStudent: z.number().int().min(0),
  trialFixed: z.number().int().min(0),
  payForUnexcused: z.boolean(),
  bonusApply: z.enum(["WHOLE_MONTH", "ABOVE_THRESHOLD"]),
  tiers: z.array(z.object({ thresholdHours: z.number().positive(), bonusPercent: z.number().positive().max(100) })).max(5),
});

export type PlanPayload = z.input<typeof planSchema>;

export async function savePlanAction(planId: string | null, payload: PlanPayload): Promise<Result> {
  const user = await requirePermission("teachers.rates");
  return runAction(async () => {
    const input = planSchema.parse(payload);
    const today = localDateOf(now());
    if (planId) {
      const r = await revisePlan(prisma, user.id, planId, input, today);
      revalidateTeachers();
      return { ok: true, message: `Сохранено. Новая ставка действует с ${r.effective.split("-").reverse().join(".")}` };
    }
    await createPlan(prisma, user.id, input, today);
    revalidateTeachers();
    return { ok: true, message: "Шаблон создан" };
  });
}

export async function assignPlanAction(teacherId: string, planId: string, from: string): Promise<Result> {
  const user = await requirePermission("teachers.rates");
  return runAction(async () => {
    const r = await assignPlan(prisma, user.id, teacherId, planId, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(from), localDateOf(now()));
    revalidateTeachers();
    return { ok: true, message: `Ставка назначена с ${r.from.split("-").reverse().join(".")}` };
  });
}
