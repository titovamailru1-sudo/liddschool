import { cache } from "react";
import { redirect } from "next/navigation";
import { can, type Permission, type Role } from "@/lib/access";
import { auth } from "./auth";
import { prisma } from "./db";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  teacherId: string | null;
}

/**
 * Текущий пользователь. Роль и активность перечитываются из БД на каждый запрос,
 * чтобы смена роли или блокировка действовали сразу, а не по истечении JWT.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, teacher: { select: { id: true } } },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, teacherId: user.teacher?.id ?? null };
});

/** Для серверных компонентов и действий: без входа — на /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Серверная проверка права (второй уровень защиты после proxy.ts). */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/forbidden");
  return user;
}
