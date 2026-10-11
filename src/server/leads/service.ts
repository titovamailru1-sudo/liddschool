import type { LeadSource, LeadStage, Program } from "@prisma/client";
import { addDays, nextMonth, parseLocalDate, startOfDay, zonedInstant, type LocalDate } from "@/domain/calendar";
import { calcOffer, LEAD_STAGE_LABEL, leadConversion, leadNeedsTouch, renderOfferMessage } from "@/domain/crm";
import { subjectDative, studentNameGenitive } from "@/domain/names";
import { lessonHours, tariffOn } from "@/domain/pricing";
import { DomainError } from "../errors";
import { loadTariffs, type Db } from "../lessons/context";
import { checkConflicts, moveLesson, type ConflictView } from "../lessons/service";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface LeadInput {
  childName: string;
  grade?: number | null;
  parentName?: string | null;
  phone: string;
  source: LeadSource;
  subject?: string | null;
  program?: Program | null;
  goal?: string | null;
  preferredTime?: string | null;
  comment?: string | null;
  ownerId?: string | null;
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function leadData(i: LeadInput) {
  if (!i.childName.trim()) throw new DomainError("Укажите имя ребёнка");
  if (i.phone.replace(/\D/g, "").length < 5) throw new DomainError("Укажите телефон");
  return {
    childName: i.childName.trim(),
    grade: i.grade ?? null,
    parentName: clean(i.parentName),
    phone: i.phone.trim(),
    source: i.source,
    subject: clean(i.subject),
    program: i.program ?? null,
    goal: clean(i.goal),
    preferredTime: clean(i.preferredTime),
    comment: clean(i.comment),
    ownerId: i.ownerId ?? null,
  };
}

export async function listLeads(db: Db, f: { q?: string; source?: LeadSource; ownerId?: string; from?: LocalDate; to?: LocalDate }, now: Date) {
  const rows = await db.lead.findMany({
    where: {
      ...(f.source ? { source: f.source } : {}),
      ...(f.ownerId ? { ownerId: f.ownerId } : {}),
      ...(f.from && f.to ? { createdAt: { gte: startOfDay(f.from), lt: startOfDay(addDays(f.to, 1)) } } : {}),
      ...(f.q
        ? {
            OR: [
              { childName: { contains: f.q, mode: "insensitive" } },
              { parentName: { contains: f.q, mode: "insensitive" } },
              { phone: { contains: f.q.replace(/\D/g, "").slice(-4) || f.q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { owner: { select: { id: true, name: true } }, trialLesson: { select: { id: true, startsAt: true, status: true } } },
  });
  return rows.map((l) => ({
    id: l.id,
    childName: l.childName,
    grade: l.grade,
    parentName: l.parentName,
    phone: l.phone,
    source: l.source,
    subject: l.subject,
    program: l.program,
    goal: l.goal,
    preferredTime: l.preferredTime,
    comment: l.comment,
    stage: l.stage,
    lostReason: l.lostReason,
    owner: l.owner,
    convertedClientId: l.convertedClientId,
    trialLesson: l.trialLesson ? { id: l.trialLesson.id, startsAt: l.trialLesson.startsAt.toISOString(), status: l.trialLesson.status } : null,
    lastTouchAt: l.lastTouchAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    needsTouch: leadNeedsTouch(l.stage, l.lastTouchAt, l.createdAt, now),
  }));
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

/** Заявки за период и конверсия в оплату по источникам. */
export async function leadStats(db: Db, from: LocalDate, to: LocalDate) {
  const leads = await db.lead.findMany({
    where: { createdAt: { gte: startOfDay(from), lt: startOfDay(addDays(to, 1)) } },
    select: { source: true, stage: true },
  });
  return leadConversion(leads);
}

export async function leadTouches(db: Db, leadId: string) {
  const rows = await db.leadTouch.findMany({ where: { leadId }, orderBy: { at: "desc" }, include: { author: { select: { name: true } } } });
  return rows.map((t) => ({ id: t.id, kind: t.kind, text: t.text, at: t.at.toISOString(), author: t.author?.name ?? "система" }));
}

export async function createLead(db: RootDb, actorId: string, input: LeadInput) {
  const data = leadData(input);
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({ data: { ...data, ownerId: data.ownerId ?? actorId } });
    await tx.leadTouch.create({ data: { leadId: lead.id, kind: "stage", text: "Заявка создана", authorId: actorId } });
    await tx.auditLog.create({ data: { entity: "Lead", entityId: lead.id, action: "create", userId: actorId } });
    return lead;
  });
}

export async function updateLead(db: RootDb, actorId: string, leadId: string, input: LeadInput) {
  await db.lead.update({ where: { id: leadId }, data: leadData(input) });
  await db.auditLog.create({ data: { entity: "Lead", entityId: leadId, action: "update", userId: actorId } });
}

/** Касание: звонок, сообщение или заметка. Первое касание переводит новую заявку в «Связались». */
export async function addLeadTouch(db: RootDb, actorId: string, leadId: string, kind: "call" | "message" | "note", text: string) {
  if (!text.trim()) throw new DomainError("Опишите касание");
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new DomainError("Лид не найден");
  await db.$transaction(async (tx) => {
    await tx.leadTouch.create({ data: { leadId, kind, text: text.trim(), authorId: actorId } });
    const toContacted = lead.stage === "NEW" && kind !== "note";
    await tx.lead.update({ where: { id: leadId }, data: { lastTouchAt: new Date(), ...(toContacted ? { stage: "CONTACTED" } : {}) } });
    if (toContacted) await tx.leadTouch.create({ data: { leadId, kind: "stage", text: `Этап: ${LEAD_STAGE_LABEL.CONTACTED}`, authorId: actorId } });
  });
}

/** Смена этапа воронки (перетаскиванием или кнопкой). Отказ — только с причиной. */
export async function setLeadStage(db: RootDb, actorId: string, leadId: string, stage: LeadStage, lostReason?: string | null) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new DomainError("Лид не найден");
  if (stage === "LOST" && !lostReason?.trim()) throw new DomainError("Укажите причину отказа");
  if (lead.stage === stage) return;
  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { stage, lostReason: stage === "LOST" ? lostReason!.trim() : null, lastTouchAt: new Date() },
    });
    await tx.leadTouch.create({
      data: { leadId, kind: "stage", text: `Этап: ${LEAD_STAGE_LABEL[stage]}${stage === "LOST" ? ` — ${lostReason!.trim()}` : ""}`, authorId: actorId },
    });
  });
}

export interface TrialInput {
  teacherId: string;
  date: LocalDate;
  time: string;
  durationMin: number;
  subject: string;
  onlineUrl?: string | null;
}

/**
 * Назначить пробный урок: урок появляется в расписании педагога (для ученика бесплатный, педагогу — фикс).
 * Если пробный уже назначен и не проведён — переносится.
 */
export async function scheduleTrial(db: RootDb, actorId: string, leadId: string, input: TrialInput): Promise<{ ok: true } | { ok: false; conflicts: ConflictView[] }> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { trialLesson: true } });
  if (!lead) throw new DomainError("Лид не найден");
  lessonHours(input.durationMin);
  const startsAt = zonedInstant(input.date, input.time);

  if (lead.trialLesson && lead.trialLesson.status === "PLANNED") {
    const r = await moveLesson(db, { userId: actorId }, lead.trialLesson.id, { date: input.date, time: input.time, teacherId: input.teacherId, durationMin: input.durationMin });
    if (!r.ok) return { ok: false, conflicts: r.conflicts };
    await db.lead.update({ where: { id: leadId }, data: { trialLessonId: r.value.lessonId } });
    await db.leadTouch.create({ data: { leadId, kind: "stage", text: "Пробный урок перенесён", authorId: actorId } });
    return { ok: true };
  }

  const conflicts = (await checkConflicts(db, [{ teacherId: input.teacherId, clientIds: [], startsAt, durationMin: input.durationMin }])).filter(
    (c) => c.kind === "teacher",
  );
  if (conflicts.length) return { ok: false, conflicts };
  const teacher = await db.teacher.findUnique({ where: { id: input.teacherId } });
  if (!teacher) throw new DomainError("Педагог не найден");

  await db.$transaction(async (tx) => {
    const lesson = await tx.lesson.create({
      data: {
        teacherId: input.teacherId,
        subject: input.subject.trim() || lead.subject || "математика",
        program: lead.program ?? "EXAM",
        startsAt,
        durationMin: input.durationMin,
        format: "ONLINE",
        onlineUrl: input.onlineUrl?.trim() || teacher.onlineUrl,
        isTrial: true,
        createdById: actorId,
      },
    });
    await tx.lead.update({ where: { id: leadId }, data: { trialLessonId: lesson.id, stage: "TRIAL_SCHEDULED", lastTouchAt: new Date() } });
    await tx.leadTouch.create({
      data: { leadId, kind: "stage", text: `Пробный урок назначен: ${input.date.split("-").reverse().join(".")} ${input.time}, ${teacher.fullName}`, authorId: actorId },
    });
  });
  return { ok: true };
}

/** Расчёт предложения по выбранному расписанию на следующий месяц и текст для родителя. */
export async function leadOffer(db: Db, leadId: string, slots: { weekday: number; durationMin: number }[], today: LocalDate) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new DomainError("Лид не найден");
  if (!slots.length) throw new DomainError("Выберите дни занятий");
  const tariffs = await loadTariffs(db);
  const { year, month } = parseLocalDate(today);
  const target = nextMonth(year, month);
  const program = lead.program ?? "EXAM";
  const on = `${target.year}-${String(target.month).padStart(2, "0")}-01`;
  const monthlyRate = tariffOn(tariffs, { kind: "INDIVIDUAL", program, paymentMode: "MONTHLY" }, on).pricePerHour;
  const perLessonRate = tariffOn(tariffs, { kind: "INDIVIDUAL", program, paymentMode: "PER_LESSON" }, on).pricePerHour;
  const offer = calcOffer({ slots, year: target.year, month: target.month, monthlyRate, perLessonRate });
  const [first] = lead.childName.trim().split(/\s+/);
  const text = renderOfferMessage({
    parentName: lead.parentName?.split(/\s+/).slice(1, 3).join(" ") || lead.parentName,
    childName: studentNameGenitive(first, null),
    subject: subjectDative(lead.subject ?? "математика"),
    slots,
    month: target.month,
    offer,
    perLessonRate,
  });
  return { month: target, monthlyRate, perLessonRate, lessonsCount: offer.lessonsCount, amount: offer.amount, perLessonAmount: offer.perLessonAmount, savings: offer.savings, text };
}

export interface ConvertInput {
  fullName: string; // «Фамилия Имя» ученика
  gender: "MALE" | "FEMALE" | null;
  grade: number | null;
  program: Program;
  paymentMode: "MONTHLY" | "PER_LESSON";
  parentName: string;
  parentPhone: string;
}

/**
 * Перевести лида в клиенты: ученик и родитель создаются из заявки; пробный урок и история касаний
 * остаются привязанными (видны в карточке ученика). Лид — «Оплатил».
 */
export async function convertLead(db: RootDb, actorId: string, leadId: string, input: ConvertInput) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new DomainError("Лид не найден");
  if (lead.convertedClientId) throw new DomainError("Лид уже переведён в клиенты");
  if (input.fullName.trim().split(/\s+/).length < 2) throw new DomainError("Укажите фамилию и имя ученика");
  if (!input.parentName.trim() || input.parentPhone.replace(/\D/g, "").length < 5) throw new DomainError("Укажите родителя и телефон");
  return db.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        fullName: input.fullName.trim(),
        gender: input.gender,
        grade: input.grade,
        program: input.program,
        paymentMode: input.paymentMode,
        goal: lead.goal,
        source: lead.source,
        notes: lead.comment,
        parents: { create: { fullName: input.parentName.trim(), phone: input.parentPhone.trim(), isPrimary: true } },
      },
    });
    await tx.lead.update({ where: { id: leadId }, data: { convertedClientId: client.id, stage: "WON", lastTouchAt: new Date() } });
    if (lead.trialLessonId) await tx.lesson.update({ where: { id: lead.trialLessonId }, data: { clientId: client.id } });
    await tx.leadTouch.create({ data: { leadId, kind: "stage", text: `Переведён в клиенты: ${client.fullName}`, authorId: actorId } });
    await tx.auditLog.create({ data: { entity: "Client", entityId: client.id, action: "createFromLead", userId: actorId, diff: { leadId } } });
    return { clientId: client.id };
  });
}

/** Для карточки ученика: из какого лида пришёл и история касаний. */
export async function leadOfClient(db: Db, clientId: string) {
  const lead = await db.lead.findUnique({ where: { convertedClientId: clientId } });
  if (!lead) return null;
  return { id: lead.id, source: lead.source, createdAt: lead.createdAt.toISOString(), touches: await leadTouches(db, lead.id) };
}
