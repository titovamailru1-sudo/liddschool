import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { localDateOf } from "@/domain/calendar";
import { can } from "@/lib/access";
import { monthParam } from "@/lib/month-param";
import { PROGRAM_LABEL } from "@/lib/status";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { groupCard } from "@/server/groups/queries";
import { lessonFormOptions } from "@/server/lessons/queries";
import { requirePermission } from "@/server/session";
import { GroupCardView } from "./group-card";

export const metadata = { title: "Группа" };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const user = await requirePermission("groups.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const at = now();
  const today = localDateOf(at);
  const m = monthParam(sp.month, today);
  const card = await groupCard(user, id, m, at);
  if (!card) notFound();

  const canManage = can(user.role, "groups.manage");
  const [options, clients, teachers] = await Promise.all([
    canManage ? lessonFormOptions(user) : Promise.resolve(null),
    canManage
      ? prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, program: true } })
      : Promise.resolve([]),
    canManage ? prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, subjects: true } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <Link href="/groups" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Группы
      </Link>
      <PageHeader
        title={`Группа ${card.name}`}
        description={[card.subject, PROGRAM_LABEL[card.program], card.teacher.fullName, `${card.members.length} из ${card.maxStudents} учеников`, !card.isActive && "в архиве"]
          .filter(Boolean)
          .join(" · ")}
      />
      <GroupCardView card={card} month={m} today={today} canManage={canManage} options={options} clients={clients} teachers={teachers} />
    </>
  );
}
