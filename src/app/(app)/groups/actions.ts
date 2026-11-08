"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateOf } from "@/domain/calendar";
import { revalidateBilling, runAction, type Result } from "@/server/action-result";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { addGroupMember, createGroup, removeGroupMember, updateGroup } from "@/server/groups/service";
import { requirePermission } from "@/server/session";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");
const groupSchema = z.object({
  name: z.string().trim().min(1, "Укажите название группы").max(60),
  subject: z.string().trim().min(1, "Укажите предмет").max(60),
  program: z.enum(["EXAM", "SCHOOL"]),
  teacherId: z.string().min(1, "Выберите педагога"),
  maxStudents: z.number().int().min(1).max(50),
  isActive: z.boolean().default(true),
});

function revalidate() {
  revalidatePath("/groups", "layout");
  revalidateBilling(); // состав группы влияет на уроки учеников и их счета
}

export async function saveGroupAction(id: string | null, payload: z.input<typeof groupSchema>): Promise<Result<{ id: string }>> {
  const user = await requirePermission("groups.manage");
  return runAction(async () => {
    const p = groupSchema.parse(payload);
    if (id) await updateGroup(prisma, user.id, id, p, localDateOf(now()));
    const groupId = id ?? (await createGroup(prisma, user.id, p)).id;
    revalidate();
    return { ok: true, message: id ? "Группа сохранена" : `Группа «${p.name}» создана`, data: { id: groupId } };
  });
}

export async function addMemberAction(groupId: string, clientId: string, from: string): Promise<Result> {
  const user = await requirePermission("groups.manage");
  return runAction(async () => {
    await addGroupMember(prisma, user.id, z.string().min(1).parse(groupId), z.string().min(1, "Выберите ученика").parse(clientId), date.parse(from));
    revalidate();
    return { ok: true, message: "Ученик добавлен в группу" };
  });
}

export async function removeMemberAction(groupId: string, clientId: string, from: string): Promise<Result> {
  const user = await requirePermission("groups.manage");
  return runAction(async () => {
    await removeGroupMember(prisma, user.id, z.string().min(1).parse(groupId), z.string().min(1).parse(clientId), date.parse(from));
    revalidate();
    return { ok: true, message: "Ученик выведен из группы" };
  });
}
