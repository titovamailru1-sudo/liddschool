"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import type { LessonOutcome } from "@/domain/lessonSettlement";
import { can } from "@/lib/access";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import {
  cancelLesson,
  createLessons,
  moveLesson,
  previewCreate,
  setSeriesEnd,
  settle,
  updateLessonNotes,
  type ConflictView,
} from "@/server/lessons/service";
import { requirePermission, type CurrentUser } from "@/server/session";

export type ActionResult =
  | { ok: true; message?: string; warnings?: ConflictView[]; id?: string }
  | { ok: false; error?: string; conflicts?: ConflictView[]; blocking?: boolean };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время");
const duration = z.number().int().min(15).max(240).multipleOf(15);
const id = z.string().min(1);

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Проверьте поля формы" };
    throw e;
  }
}

function done(message: string, extra: Partial<Extract<ActionResult, { ok: true }>> = {}): ActionResult {
  revalidatePath("/lessons");
  revalidatePath("/clients", "layout");
  return { ok: true, message, ...extra };
}

/** Педагог работает только со своими уроками. */
async function assertLessonAccess(user: CurrentUser, lessonId: string) {
  if (user.role !== "TEACHER") return;
  const l = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { teacherId: true } });
  if (!l || l.teacherId !== user.teacherId) throw new DomainError("Это не ваш урок");
}

// ── Создание ──

const createSchema = z.object({
  teacherId: id,
  clientId: z.string().nullish(),
  groupId: z.string().nullish(),
  subject: z.string().trim().min(1, "Укажите предмет"),
  date,
  time,
  durationMin: duration,
  onlineUrl: z.string().trim().max(500).nullish(),
  repeat: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("once") }),
    z.object({
      kind: z.literal("weekly"),
      weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Выберите дни недели"),
      until: date.nullable(),
    }),
  ]),
  force: z.boolean().optional(),
});

export type CreateLessonPayload = z.input<typeof createSchema>;

export async function previewCreateAction(payload: CreateLessonPayload) {
  await requirePermission("lessons.create");
  try {
    return { ok: true as const, ...(await previewCreate(prisma, createSchema.parse(payload), localDateOf(now()))) };
  } catch (e) {
    if (e instanceof DomainError || e instanceof z.ZodError) return { ok: false as const };
    throw e;
  }
}

export async function createLessonAction(payload: CreateLessonPayload): Promise<ActionResult> {
  const user = await requirePermission("lessons.create");
  return run(async () => {
    const input = createSchema.parse(payload);
    const r = await createLessons(prisma, { userId: user.id }, input, localDateOf(now()));
    if (!r.ok) return r;
    const msg = input.repeat.kind === "once" ? "Урок создан" : "Расписание создано";
    return done(msg, { warnings: r.warnings, id: r.value.lessonIds[0] });
  });
}

// ── Отметка ──

const settleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PLANNED") }),
  z.object({
    kind: z.literal("DONE"),
    attendance: z.record(z.string(), z.enum(["PRESENT", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"])),
  }),
]);

export async function settleLessonAction(lessonId: string, outcome: LessonOutcome): Promise<ActionResult> {
  const user = await requirePermission("lessons.mark");
  return run(async () => {
    await assertLessonAccess(user, lessonId);
    const parsed = settleSchema.parse(outcome);
    // Вернуть отменённый урок в расписание — решение администратора.
    if (parsed.kind === "PLANNED" && !can(user.role, "lessons.manage")) {
      const l = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { status: true } });
      if (l?.status === "CANCELLED") throw new DomainError("Вернуть отменённый урок может администратор");
    }
    await settle(prisma, { userId: user.id }, id.parse(lessonId), parsed);
    return done(parsed.kind === "PLANNED" ? "Отметка снята" : "Урок отмечен");
  });
}

// ── Отмена и перенос ──

const cancelSchema = z.object({
  by: z.enum(["SCHOOL", "CLIENT"]),
  notifiedAt: z.string().datetime({ offset: true }).optional(),
  excused: z.boolean().optional(),
  reason: z.string().trim().max(500).nullish(),
});

export async function cancelLessonAction(lessonId: string, payload: z.input<typeof cancelSchema>): Promise<ActionResult> {
  const user = await requirePermission("lessons.manage");
  return run(async () => {
    const p = cancelSchema.parse(payload);
    const s = await cancelLesson(prisma, { userId: user.id }, id.parse(lessonId), {
      ...p,
      notifiedAt: p.notifiedAt ? new Date(p.notifiedAt) : undefined,
    });
    return done(s.status === "DONE" ? "Отмечен неуважительный пропуск" : "Урок отменён");
  });
}

const moveSchema = z.object({
  date,
  time,
  teacherId: z.string().optional(),
  durationMin: duration.optional(),
  force: z.boolean().optional(),
});

export async function moveLessonAction(lessonId: string, payload: z.input<typeof moveSchema>): Promise<ActionResult> {
  const user = await requirePermission("lessons.manage");
  return run(async () => {
    const r = await moveLesson(prisma, { userId: user.id }, id.parse(lessonId), moveSchema.parse(payload));
    if (!r.ok) return r;
    return done("Урок перенесён", { warnings: r.warnings, id: r.value.lessonId });
  });
}

// ── Тема, ДЗ, комментарий ──

const notesSchema = z.object({
  topic: z.string().max(500).nullish(),
  homework: z.string().max(2000).nullish(),
  comment: z.string().max(2000).nullish(),
  onlineUrl: z.string().max(500).nullish(),
});

export async function updateNotesAction(lessonId: string, payload: z.input<typeof notesSchema>): Promise<ActionResult> {
  const user = await requirePermission("lessons.mark");
  return run(async () => {
    await assertLessonAccess(user, lessonId);
    const p = notesSchema.parse(payload);
    // Ссылку на занятие меняет администратор.
    if (!can(user.role, "lessons.manage")) delete p.onlineUrl;
    await updateLessonNotes(prisma, { userId: user.id }, id.parse(lessonId), p);
    return done("Сохранено");
  });
}

// ── Срок действия расписания ученика ──

export async function setSeriesEndAction(seriesId: string, endsOn: string | null): Promise<ActionResult> {
  const user = await requirePermission("lessons.manage");
  return run(async () => {
    const r = await setSeriesEnd(prisma, { userId: user.id }, id.parse(seriesId), date.nullable().parse(endsOn), localDateOf(now()));
    const parts = [endsOn ? "Срок расписания изменён" : "Расписание бессрочное"];
    if (r.removed) parts.push(`убрано уроков: ${r.removed}`);
    if (r.created) parts.push(`добавлено: ${r.created}`);
    return done(parts.join(", "));
  });
}
