import type { Program } from "@prisma/client";
import { startOfDay, type LocalDate } from "@/domain/calendar";
import { DomainError } from "../errors";
import type { Db } from "../lessons/context";

type RootDb = Extract<Db, { $transaction: unknown }>;

export interface GroupInput {
  name: string;
  subject: string;
  program: Program;
  teacherId: string;
  maxStudents: number;
}

function check(i: GroupInput) {
  if (!i.name.trim()) throw new DomainError("Укажите название группы");
  if (!i.subject.trim()) throw new DomainError("Укажите предмет");
  if (!Number.isInteger(i.maxStudents) || i.maxStudents < 1 || i.maxStudents > 50) throw new DomainError("Максимум учеников — от 1 до 50");
}

async function activeCount(db: Db, groupId: string) {
  return db.groupMember.count({ where: { groupId, leftAt: null } });
}

export async function createGroup(db: RootDb, actorId: string, input: GroupInput) {
  check(input);
  if (await db.group.findFirst({ where: { name: { equals: input.name.trim(), mode: "insensitive" }, isActive: true } })) {
    throw new DomainError(`Группа «${input.name.trim()}» уже есть`);
  }
  const g = await db.group.create({
    data: { name: input.name.trim(), subject: input.subject.trim(), program: input.program, teacherId: input.teacherId, maxStudents: input.maxStudents },
  });
  await db.auditLog.create({ data: { entity: "Group", entityId: g.id, action: "create", userId: actorId, diff: { ...input } } });
  return g;
}

/**
 * Изменить группу. Педагога можно сменить, только пока у группы нет действующего расписания:
 * уроки уже созданы на педагога из расписания — сначала завершите его и задайте новое с новым педагогом.
 */
export async function updateGroup(db: RootDb, actorId: string, id: string, input: GroupInput & { isActive: boolean }, today: LocalDate) {
  check(input);
  const g = await db.group.findUnique({ where: { id } });
  if (!g) throw new DomainError("Группа не найдена");
  if (input.teacherId !== g.teacherId) {
    const active = await db.scheduleSeries.count({ where: { groupId: id, OR: [{ endsOn: null }, { endsOn: { gte: startOfDay(today) } }] } });
    if (active) throw new DomainError("У группы есть действующее расписание — сначала завершите его, затем смените педагога");
  }
  if (input.maxStudents < (await activeCount(db, id))) throw new DomainError("Максимум меньше, чем учеников в группе сейчас");
  await db.group.update({
    where: { id },
    data: { name: input.name.trim(), subject: input.subject.trim(), program: input.program, teacherId: input.teacherId, maxStudents: input.maxStudents, isActive: input.isActive },
  });
  await db.auditLog.create({ data: { entity: "Group", entityId: id, action: "update", userId: actorId, diff: { ...input } } });
}

/** Добавить ученика с даты: уроки группы с этого дня — его (посещаемость, счёт абонемента, поурочная оплата). */
export async function addGroupMember(db: RootDb, actorId: string, groupId: string, clientId: string, from: LocalDate) {
  const g = await db.group.findUnique({ where: { id: groupId } });
  if (!g || !g.isActive) throw new DomainError("Группа не найдена или в архиве");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client || client.status === "ARCHIVED") throw new DomainError("Ученик не найден или в архиве");
  const existing = await db.groupMember.findUnique({ where: { groupId_clientId: { groupId, clientId } } });
  if (existing && !existing.leftAt) throw new DomainError(`${client.fullName} уже в группе`);
  if ((await activeCount(db, groupId)) >= g.maxStudents) throw new DomainError(`В группе уже ${g.maxStudents} из ${g.maxStudents} — увеличьте максимум`);

  const joinedAt = startOfDay(from);
  // Повторное вступление: прежний период участия заменяется новым (одна запись на пару «группа — ученик»).
  if (existing) await db.groupMember.update({ where: { id: existing.id }, data: { joinedAt, leftAt: null } });
  else await db.groupMember.create({ data: { groupId, clientId, joinedAt } });
  await db.auditLog.create({ data: { entity: "Group", entityId: groupId, action: "member-add", userId: actorId, diff: { clientId, from } } });
}

/** Вывести ученика из группы с даты: уроки с этого дня уже не его. Прошлая посещаемость остаётся. */
export async function removeGroupMember(db: RootDb, actorId: string, groupId: string, clientId: string, from: LocalDate) {
  const m = await db.groupMember.findUnique({ where: { groupId_clientId: { groupId, clientId } } });
  if (!m || m.leftAt) throw new DomainError("Ученика нет в группе");
  const leftAt = startOfDay(from);
  if (leftAt < m.joinedAt) throw new DomainError("Дата выхода раньше даты вступления");
  await db.groupMember.update({ where: { id: m.id }, data: { leftAt } });
  await db.auditLog.create({ data: { entity: "Group", entityId: groupId, action: "member-remove", userId: actorId, diff: { clientId, from } } });
}
