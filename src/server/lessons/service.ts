import type { Prisma } from "@prisma/client";
import {
  addDays,
  generationHorizon,
  localDateOf,
  toDbDate,
  zonedInstant,
  type LocalDate,
} from "@/domain/calendar";
import { findConflicts, type BusySlot, type Conflict } from "@/domain/conflicts";
import { formatDayMonth, formatTime } from "@/domain/format";
import {
  classifyClientCancellation,
  reconcileCharges,
  settleLesson,
  type LessonOutcome,
  type Settlement,
} from "@/domain/lessonSettlement";
import { lessonHours } from "@/domain/pricing";
import { seriesOccurrencesInRange } from "@/domain/schedule";
import { DomainError } from "../errors";
import { loadLessonStudents, loadRatePlan, loadTariffs, type Db } from "./context";
import { dropPlannedLessonsFrom, generateLessons } from "./generation";

/** Транзакции сервисов запускаются от полного клиента Prisma. */
type RootDb = Extract<Db, { $transaction: unknown }>;

export interface Actor {
  userId: string;
}

// ───────────────────────── Конфликты ─────────────────────────

export interface ConflictView {
  kind: "teacher" | "client";
  startsAt: string; // ISO кандидата
  otherStartsAt: string;
  otherTitle: string; // «Иванов Миша» / «Группа ОГЭ-9А»
  teacherName: string;
}

/** Занятость в интервале: неотменённые уроки с участниками. */
async function busyIn(db: Db, from: Date, to: Date): Promise<BusySlot[]> {
  const lessons = await db.lesson.findMany({
    where: { startsAt: { gte: new Date(from.getTime() - 4 * 3_600_000), lt: to }, status: { in: ["PLANNED", "DONE"] } },
    select: {
      id: true,
      teacherId: true,
      startsAt: true,
      durationMin: true,
      clientId: true,
      group: { select: { members: { where: { leftAt: null }, select: { clientId: true } } } },
    },
  });
  return lessons.map((l) => ({
    id: l.id,
    teacherId: l.teacherId,
    startsAt: l.startsAt,
    durationMin: l.durationMin,
    clientIds: l.clientId ? [l.clientId] : (l.group?.members.map((m) => m.clientId) ?? []),
  }));
}

async function describeConflicts(db: Db, conflicts: Conflict[]): Promise<ConflictView[]> {
  if (!conflicts.length) return [];
  const ids = [...new Set(conflicts.map((c) => c.other.id!).filter(Boolean))];
  const lessons = await db.lesson.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      client: { select: { fullName: true } },
      group: { select: { name: true } },
      teacher: { select: { fullName: true } },
    },
  });
  const byId = new Map(lessons.map((l) => [l.id, l]));
  return conflicts.map((c) => {
    const l = byId.get(c.other.id!);
    return {
      kind: c.kind,
      startsAt: c.candidateStartsAt.toISOString(),
      otherStartsAt: c.other.startsAt.toISOString(),
      otherTitle: l?.client?.fullName ?? (l?.group ? `Группа ${l.group.name}` : "урок"),
      teacherName: l?.teacher.fullName ?? "",
    };
  });
}

export async function checkConflicts(db: Db, candidates: BusySlot[]): Promise<ConflictView[]> {
  if (!candidates.length) return [];
  const times = candidates.map((c) => c.startsAt.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times) + 4 * 3_600_000);
  return describeConflicts(db, findConflicts(candidates, await busyIn(db, from, to)));
}

/** Результат операции с возможными конфликтами: педагог занят — ошибка, ученик занят — нужно подтверждение. */
export type ScheduleResult<T> =
  | { ok: true; value: T; warnings: ConflictView[] }
  | { ok: false; conflicts: ConflictView[]; blocking: boolean };

function gate(conflicts: ConflictView[], force: boolean): { ok: false; conflicts: ConflictView[]; blocking: boolean } | null {
  const blocking = conflicts.some((c) => c.kind === "teacher");
  if (blocking) return { ok: false, conflicts, blocking: true };
  if (conflicts.length && !force) return { ok: false, conflicts, blocking: false };
  return null;
}

// ───────────────────────── Создание ─────────────────────────

export interface CreateLessonInput {
  teacherId: string;
  clientId?: string | null;
  groupId?: string | null;
  subject: string;
  date: LocalDate; // первый урок
  time: string; // «16:00»
  durationMin: number;
  onlineUrl?: string | null;
  /** Разовый урок или еженедельно по выбранным дням недели. */
  repeat: { kind: "once" } | { kind: "weekly"; weekdays: number[]; until: LocalDate | null };
  force?: boolean; // сохранить несмотря на занятость ученика
}

async function resolveTarget(db: Db, input: Pick<CreateLessonInput, "clientId" | "groupId" | "teacherId">) {
  if (!!input.clientId === !!input.groupId) throw new DomainError("Выберите ученика или группу");
  const teacher = await db.teacher.findUnique({ where: { id: input.teacherId } });
  if (!teacher || !teacher.isActive) throw new DomainError("Педагог не найден");
  if (input.clientId) {
    const client = await db.client.findUnique({ where: { id: input.clientId } });
    if (!client || client.status === "ARCHIVED") throw new DomainError("Ученик не найден или в архиве");
    return { teacher, program: client.program, clientIds: [client.id] };
  }
  const group = await db.group.findUnique({
    where: { id: input.groupId! },
    include: { members: { where: { leftAt: null }, select: { clientId: true } } },
  });
  if (!group || !group.isActive) throw new DomainError("Группа не найдена");
  return { teacher, program: group.program, clientIds: group.members.map((m) => m.clientId) };
}

/** Создать разовый урок или регулярное расписание (по серии на каждый день недели). */
export async function createLessons(
  db: RootDb,
  actor: Actor,
  input: CreateLessonInput,
  today: LocalDate,
): Promise<ScheduleResult<{ lessonIds: string[]; seriesIds: string[] }>> {
  lessonHours(input.durationMin); // проверка длительности
  const target = await resolveTarget(db, input);
  const onlineUrl = input.onlineUrl?.trim() || target.teacher.onlineUrl;

  // Кандидаты: разовый урок или все уроки серий до конца срока / горизонта генерации.
  const repeat = input.repeat;
  const candidates: BusySlot[] = [];
  if (repeat.kind === "once") {
    candidates.push({
      teacherId: input.teacherId,
      clientIds: target.clientIds,
      startsAt: zonedInstant(input.date, input.time),
      durationMin: input.durationMin,
    });
  } else {
    if (!repeat.weekdays.length) throw new DomainError("Выберите дни недели");
    if (repeat.until && repeat.until < input.date) throw new DomainError("Дата окончания раньше даты начала");
    const horizon = generationHorizon(today);
    const to = repeat.until && repeat.until < horizon ? repeat.until : horizon;
    for (const weekday of repeat.weekdays) {
      for (const o of seriesOccurrencesInRange(
        { id: "new", weekday, startTime: input.time, durationMin: input.durationMin, startsOn: input.date, endsOn: repeat.until },
        input.date,
        to,
      )) {
        candidates.push({ teacherId: input.teacherId, clientIds: target.clientIds, startsAt: o.startsAt, durationMin: o.durationMin });
      }
    }
    if (!candidates.length) throw new DomainError("В выбранный период нет ни одного урока");
  }

  const conflicts = await checkConflicts(db, candidates);
  const stop = gate(conflicts, !!input.force);
  if (stop) return stop;

  const value = await db.$transaction(async (tx) => {
    const base = {
      teacherId: input.teacherId,
      clientId: input.clientId ?? null,
      groupId: input.groupId ?? null,
      subject: input.subject.trim(),
      program: target.program,
      durationMin: input.durationMin,
      format: "ONLINE" as const,
      onlineUrl,
      createdById: actor.userId,
    };
    if (repeat.kind === "once") {
      const lesson = await tx.lesson.create({ data: { ...base, startsAt: candidates[0].startsAt } });
      await audit(tx, actor, "Lesson", lesson.id, "create", { startsAt: lesson.startsAt });
      return { lessonIds: [lesson.id], seriesIds: [] };
    }
    const seriesIds: string[] = [];
    for (const weekday of repeat.weekdays) {
      const s = await tx.scheduleSeries.create({
        data: {
          ...base,
          weekday,
          startTime: input.time,
          startsOn: toDbDate(input.date),
          endsOn: repeat.until ? toDbDate(repeat.until) : null,
        },
      });
      seriesIds.push(s.id);
      await audit(tx, actor, "ScheduleSeries", s.id, "create", { weekday, time: input.time, until: repeat.until });
    }
    const series = await tx.scheduleSeries.findMany({ where: { id: { in: seriesIds } } });
    await generateLessons(tx, series, input.date, generationHorizon(today));
    return { lessonIds: [], seriesIds };
  });
  return { ok: true, value, warnings: conflicts };
}

// ───────────────────────── Срок действия серии ─────────────────────────

/**
 * Изменить дату окончания серии (срок действия расписания ученика). null — бессрочно.
 * Запланированные уроки после новой даты удаляются, при продлении — досоздаются до горизонта.
 */
export async function setSeriesEnd(db: RootDb, actor: Actor, seriesId: string, endsOn: LocalDate | null, today: LocalDate) {
  return db.$transaction(async (tx) => {
    const s = await tx.scheduleSeries.findUnique({ where: { id: seriesId } });
    if (!s) throw new DomainError("Расписание не найдено");
    const startsOn = s.startsOn.toISOString().slice(0, 10);
    if (endsOn && endsOn < startsOn) throw new DomainError("Дата окончания раньше начала расписания");
    const updated = await tx.scheduleSeries.update({
      where: { id: seriesId },
      data: { endsOn: endsOn ? toDbDate(endsOn) : null },
    });
    const removed = endsOn ? await dropPlannedLessonsFrom(tx, seriesId, addDays(endsOn, 1)) : 0;
    const from = startsOn > today ? startsOn : today;
    const created = await generateLessons(tx, [updated], from, generationHorizon(today));
    await audit(tx, actor, "ScheduleSeries", seriesId, "setEnd", { endsOn, removed, created });
    return { removed, created };
  });
}

// ───────────────────────── Отметка ─────────────────────────

async function applySettlement(
  tx: Prisma.TransactionClient,
  actor: Actor,
  lesson: { id: string; teacherId: string; startsAt: Date; subject: string; status: string; cancelledAt: Date | null },
  settlement: Settlement,
  extra: { cancelReason?: string | null } = {},
) {
  const now = new Date();
  const cancelled = settlement.status === "CANCELLED";
  await tx.lesson.update({
    where: { id: lesson.id },
    data: {
      status: settlement.status,
      cancelledBy: settlement.cancelledBy,
      cancelledAt: cancelled ? (lesson.cancelledAt ?? now) : null,
      cancelReason: cancelled ? (extra.cancelReason ?? null) : null,
      markedAt: settlement.status === "PLANNED" ? null : now,
      markedById: settlement.status === "PLANNED" ? null : actor.userId,
    },
  });

  // Посещаемость — не финансовая запись, её можно пересоздать целиком.
  await tx.attendance.deleteMany({ where: { lessonId: lesson.id } });
  if (settlement.attendances.length) {
    await tx.attendance.createMany({
      data: settlement.attendances.map((a) => ({ lessonId: lesson.id, ...a })),
    });
  }

  // Начисление педагогу пересчитывается целиком.
  const a = settlement.accrual;
  if (a.amount === 0 && a.hours === 0) {
    await tx.teacherAccrual.deleteMany({ where: { lessonId: lesson.id } });
  } else {
    const data = {
      teacherId: lesson.teacherId,
      hours: a.hours,
      hourlyAmount: a.hourlyAmount,
      extraAmount: a.extraAmount,
      amount: a.amount,
      basis: a.basis,
    };
    await tx.teacherAccrual.upsert({ where: { lessonId: lesson.id }, create: { lessonId: lesson.id, ...data }, update: data });
  }

  // Деньги клиентов: только сторно и новые записи, ничего не удаляем.
  const active = await tx.ledgerEntry.findMany({
    where: { lessonId: lesson.id, type: "LESSON_CHARGE", reversalOfId: null, reversedBy: { is: null } },
    select: { id: true, clientId: true, amount: true },
  });
  const { reverse, create } = reconcileCharges(active, settlement.charges);
  const when = `${formatDayMonth(localDateOf(lesson.startsAt))} ${formatTime(lesson.startsAt)}`;
  for (const r of reverse) {
    await tx.ledgerEntry.create({
      data: {
        clientId: r.clientId,
        type: "LESSON_CHARGE",
        amount: -r.amount,
        lessonId: lesson.id,
        reversalOfId: r.id,
        comment: `Сторно: изменена отметка урока ${when}`,
        createdById: actor.userId,
      },
    });
  }
  for (const c of create) {
    await tx.ledgerEntry.create({
      data: {
        clientId: c.clientId,
        type: "LESSON_CHARGE",
        amount: c.amount,
        lessonId: lesson.id,
        comment: `Урок ${when}, ${lesson.subject}`,
        createdById: actor.userId,
      },
    });
  }

  await audit(tx, actor, "Lesson", lesson.id, "settle", {
    from: lesson.status,
    to: settlement.status,
    cancelledBy: settlement.cancelledBy,
    attendance: settlement.attendances.map((x) => [x.clientId, x.status]),
    accrual: a.amount,
    charges: create.map((c) => [c.clientId, c.amount]),
    reversed: reverse.map((r) => r.id),
  });
}

/** Отметить урок (или снять отметку). Повторная отметка пересчитывает всё со сторно. */
export async function settle(db: RootDb, actor: Actor, lessonId: string, outcome: LessonOutcome, extra: { cancelReason?: string | null } = {}) {
  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new DomainError("Урок не найден");
    if (lesson.status === "MOVED") throw new DomainError("Урок перенесён — отмечайте новый урок");
    const tariffs = await loadTariffs(tx);
    const students = await loadLessonStudents(tx, lesson, tariffs);
    if (outcome.kind === "DONE" && !students.length) throw new DomainError("В уроке нет учеников");
    const plan = await loadRatePlan(tx, lesson.teacherId, localDateOf(lesson.startsAt));
    const settlement = settleLesson({
      durationMin: lesson.durationMin,
      isTrial: lesson.isTrial,
      isGroup: !!lesson.groupId,
      students,
      outcome,
      plan,
    });
    await applySettlement(tx, actor, lesson, settlement, extra);
    return settlement;
  });
}

export interface CancelInput {
  by: "SCHOOL" | "CLIENT";
  /** Для отмены клиентом: когда предупредили. По умолчанию — сейчас. */
  notifiedAt?: Date;
  /** Ручной выбор администратора; иначе — по правилу 24 ч. */
  excused?: boolean;
  reason?: string | null;
}

/**
 * Отмена урока. Школой — без денег. Клиентом: предупредил за 24 ч и раньше — уважительный пропуск,
 * позже — неуважительный (урок списывается поурочнику). Для групповых уроков отмена — только школой.
 */
export async function cancelLesson(db: RootDb, actor: Actor, lessonId: string, input: CancelInput) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new DomainError("Урок не найден");
  if (input.by === "CLIENT" && lesson.groupId) {
    throw new DomainError("Групповой урок отменяет школа; пропуск ученика отмечается в посещаемости");
  }
  let outcome: LessonOutcome = { kind: "CANCELLED", by: input.by };
  if (input.by === "CLIENT") {
    const excused =
      input.excused ?? classifyClientCancellation(lesson.startsAt, input.notifiedAt ?? new Date()) === "EXCUSED";
    if (!excused) outcome = { kind: "DONE", attendance: { [lesson.clientId!]: "ABSENT_UNEXCUSED" } };
  }
  return settle(db, actor, lessonId, outcome, { cancelReason: input.reason });
}

// ───────────────────────── Перенос ─────────────────────────

export interface MoveInput {
  date: LocalDate;
  time: string;
  teacherId?: string;
  durationMin?: number;
  force?: boolean;
}

/** Перенос: старый урок получает статус «перенесён», создаётся новый со ссылкой на старый. */
export async function moveLesson(db: RootDb, actor: Actor, lessonId: string, input: MoveInput): Promise<ScheduleResult<{ lessonId: string }>> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { group: { include: { members: { where: { leftAt: null }, select: { clientId: true } } } } },
  });
  if (!lesson) throw new DomainError("Урок не найден");
  if (lesson.status !== "PLANNED") throw new DomainError("Перенести можно только запланированный урок — сначала снимите отметку");
  const durationMin = input.durationMin ?? lesson.durationMin;
  lessonHours(durationMin);
  const teacherId = input.teacherId ?? lesson.teacherId;
  const startsAt = zonedInstant(input.date, input.time);
  const clientIds = lesson.clientId ? [lesson.clientId] : (lesson.group?.members.map((m) => m.clientId) ?? []);

  const conflicts = await checkConflicts(db, [{ id: lesson.id, teacherId, clientIds, startsAt, durationMin }]);
  const stop = gate(conflicts, !!input.force);
  if (stop) return stop;

  const value = await db.$transaction(async (tx) => {
    let onlineUrl = lesson.onlineUrl;
    if (teacherId !== lesson.teacherId) {
      onlineUrl = (await tx.teacher.findUnique({ where: { id: teacherId } }))?.onlineUrl ?? onlineUrl;
    }
    const moved = await tx.lesson.create({
      data: {
        teacherId,
        clientId: lesson.clientId,
        groupId: lesson.groupId,
        subject: lesson.subject,
        program: lesson.program,
        startsAt,
        durationMin,
        format: lesson.format,
        onlineUrl,
        isTrial: lesson.isTrial,
        topic: lesson.topic,
        homework: lesson.homework,
        comment: lesson.comment,
        createdById: actor.userId,
      },
    });
    await tx.lesson.update({ where: { id: lesson.id }, data: { status: "MOVED", movedToId: moved.id } });
    await audit(tx, actor, "Lesson", lesson.id, "move", { to: moved.id, startsAt: startsAt.toISOString(), teacherId });
    return { lessonId: moved.id };
  });
  return { ok: true, value, warnings: conflicts };
}

// ───────────────────────── Заметки ─────────────────────────

export async function updateLessonNotes(
  db: RootDb,
  actor: Actor,
  lessonId: string,
  data: { topic?: string | null; homework?: string | null; comment?: string | null; onlineUrl?: string | null },
) {
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const lesson = await db.lesson.update({
    where: { id: lessonId },
    data: {
      topic: clean(data.topic),
      homework: clean(data.homework),
      comment: clean(data.comment),
      onlineUrl: clean(data.onlineUrl),
    },
  });
  await audit(db, actor, "Lesson", lessonId, "notes", data);
  return lesson;
}

// ───────────────────────── Аудит ─────────────────────────

async function audit(db: Db, actor: Actor, entity: string, entityId: string, action: string, diff: unknown) {
  await db.auditLog.create({
    data: { entity, entityId, action, userId: actor.userId, diff: JSON.parse(JSON.stringify(diff ?? null)) },
  });
}
