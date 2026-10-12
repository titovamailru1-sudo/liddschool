import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { firstOfMonth, parseLocalDate, toDbDate, type LocalDate } from "@/domain/calendar";
import { appUrl } from "../billing/settings";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";
import { defaultPlan } from "./rates";

type RootDb = Extract<Db, { $transaction: unknown }>;

const INVITE_DAYS = 7;

export interface TeacherInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  color: string;
  subjects: string[];
  onlineUrl?: string | null;
}

export async function createInvite(db: Db, userId: string, actorId: string | null) {
  const token = randomBytes(18).toString("base64url");
  await db.userInvite.create({ data: { userId, token, createdById: actorId, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } });
  return `${appUrl()}/invite/${token}`;
}

/**
 * Новый педагог: карточка, ставка по шаблону школы с текущего месяца и, если указан email, —
 * учётная запись с одноразовой ссылкой для пароля.
 */
export async function createTeacher(db: RootDb, actorId: string, input: TeacherInput, today: LocalDate) {
  const email = input.email?.trim().toLowerCase() || null;
  if (email && (await db.user.findUnique({ where: { email } }))) throw new DomainError("Пользователь с таким email уже есть");
  const plan = await defaultPlan(db);
  if (!plan) throw new DomainError("Не настроен шаблон ставки школы");
  const { year, month } = parseLocalDate(today);

  return db.$transaction(async (tx) => {
    const user = email
      ? await tx.user.create({
          // Пароль задаёт сам педагог по ссылке; до этого войти нельзя.
          data: { email, name: input.fullName.trim(), role: "TEACHER", passwordHash: "!", isActive: true },
        })
      : null;
    const teacher = await tx.teacher.create({
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        color: input.color,
        subjects: input.subjects,
        onlineUrl: input.onlineUrl?.trim() || null,
        userId: user?.id,
      },
    });
    await tx.teacherRatePlan.create({ data: { teacherId: teacher.id, planId: plan.id, validFrom: toDbDate(firstOfMonth(year, month)) } });
    const inviteLink = user ? await createInvite(tx, user.id, actorId) : null;
    await tx.auditLog.create({ data: { entity: "Teacher", entityId: teacher.id, action: "create", userId: actorId } });
    return { teacherId: teacher.id, inviteLink };
  });
}

export async function updateTeacher(db: RootDb, actorId: string, teacherId: string, input: TeacherInput & { isActive: boolean }) {
  const t = await db.teacher.findUnique({ where: { id: teacherId }, include: { user: true } });
  if (!t) throw new DomainError("Педагог не найден");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && email !== t.user?.email && (await db.user.findUnique({ where: { email } }))) {
    throw new DomainError("Пользователь с таким email уже есть");
  }
  await db.$transaction(async (tx) => {
    await tx.teacher.update({
      where: { id: teacherId },
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        color: input.color,
        subjects: input.subjects,
        onlineUrl: input.onlineUrl?.trim() || null,
        isActive: input.isActive,
      },
    });
    if (t.user) {
      await tx.user.update({
        where: { id: t.user.id },
        data: { name: input.fullName.trim(), isActive: input.isActive, ...(email ? { email } : {}) },
      });
    }
    await tx.auditLog.create({ data: { entity: "Teacher", entityId: teacherId, action: "update", userId: actorId } });
  });
}

/** Ссылка для входа: создаёт учётную запись, если её ещё нет, или новую ссылку для смены пароля. */
export async function teacherInvite(db: RootDb, actorId: string, teacherId: string, email?: string | null) {
  const t = await db.teacher.findUnique({ where: { id: teacherId }, include: { user: true } });
  if (!t) throw new DomainError("Педагог не найден");
  let userId = t.user?.id;
  if (!userId) {
    const e = email?.trim().toLowerCase();
    if (!e) throw new DomainError("Укажите email педагога — он будет логином");
    if (await db.user.findUnique({ where: { email: e } })) throw new DomainError("Пользователь с таким email уже есть");
    const user = await db.user.create({ data: { email: e, name: t.fullName, role: "TEACHER", passwordHash: "!" } });
    await db.teacher.update({ where: { id: teacherId }, data: { userId: user.id } });
    userId = user.id;
  }
  return { link: await createInvite(db, userId, actorId) };
}

/** Публичная страница приглашения: проверить ссылку. */
export async function inviteInfo(db: Db, token: string) {
  const inv = await db.userInvite.findUnique({ where: { token }, include: { user: { select: { email: true, name: true } } } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  return { email: inv.user.email, name: inv.user.name };
}

/** Задать пароль по приглашению. Ссылка одноразовая. */
export async function acceptInvite(db: RootDb, token: string, password: string) {
  if (password.length < 8) throw new DomainError("Пароль — не короче 8 символов");
  const inv = await db.userInvite.findUnique({ where: { token } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) throw new DomainError("Ссылка недействительна или устарела — попросите новую");
  const hash = await bcrypt.hash(password, 10);
  const user = await db.$transaction(async (tx) => {
    await tx.userInvite.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
    return tx.user.update({ where: { id: inv.userId }, data: { passwordHash: hash, isActive: true } });
  });
  return { email: user.email };
}
