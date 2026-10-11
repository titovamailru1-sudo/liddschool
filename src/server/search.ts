import type { Prisma } from "@prisma/client";
import { can } from "@/lib/access";
import { prisma } from "./db";
import type { CurrentUser } from "./session";

export interface SearchHit {
  kind: "client" | "lead" | "teacher";
  id: string;
  title: string;
  hint: string;
  href: string;
}

/** Глобальный поиск: клиенты (ФИО, родитель, телефон), лиды и педагоги — с учётом прав. */
export async function globalSearch(user: CurrentUser, q: string): Promise<SearchHit[]> {
  const text = q.trim();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  const phone = digits.length >= 4 ? digits.slice(-4) : null;

  const teacherScope: Prisma.ClientWhereInput =
    user.role === "TEACHER"
      ? {
          OR: [
            { lessons: { some: { teacherId: user.teacherId ?? "—" } } },
            { groupMembers: { some: { group: { teacherId: user.teacherId ?? "—" } } } },
          ],
        }
      : {};

  const clients = await prisma.client.findMany({
    where: {
      AND: [
        teacherScope,
        {
          OR: [
            { fullName: { contains: text, mode: "insensitive" } },
            { parents: { some: { fullName: { contains: text, mode: "insensitive" } } } },
            ...(phone && user.role !== "TEACHER" ? [{ phone: { contains: phone } }, { parents: { some: { phone: { contains: phone } } } }] : []),
          ],
        },
      ],
    },
    take: 6,
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, grade: true, status: true, parents: { take: 1, orderBy: { isPrimary: "desc" }, select: { fullName: true } } },
  });
  const hits: SearchHit[] = clients.map((c) => ({
    kind: "client",
    id: c.id,
    title: c.fullName,
    hint: [c.grade ? `${c.grade} кл.` : null, c.parents[0]?.fullName, c.status === "ARCHIVED" ? "архив" : null].filter(Boolean).join(" · "),
    href: `/clients/${c.id}`,
  }));

  if (can(user.role, "leads.view")) {
    const leads = await prisma.lead.findMany({
      where: {
        convertedClientId: null,
        OR: [
          { childName: { contains: text, mode: "insensitive" } },
          { parentName: { contains: text, mode: "insensitive" } },
          ...(phone ? [{ phone: { contains: phone } }] : []),
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, childName: true, parentName: true, phone: true },
    });
    hits.push(...leads.map((l) => ({ kind: "lead" as const, id: l.id, title: l.childName, hint: ["лид", l.parentName, l.phone].filter(Boolean).join(" · "), href: `/leads?lead=${l.id}` })));
  }

  if (can(user.role, "teachers.view")) {
    const teachers = await prisma.teacher.findMany({
      where: { fullName: { contains: text, mode: "insensitive" } },
      take: 3,
      select: { id: true, fullName: true, subjects: true },
    });
    hits.push(...teachers.map((t) => ({ kind: "teacher" as const, id: t.id, title: t.fullName, hint: `педагог · ${t.subjects.join(", ")}`, href: `/teachers/${t.id}` })));
  }
  return hits;
}
