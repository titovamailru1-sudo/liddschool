import { localDateOf } from "@/domain/calendar";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/access";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { groupList } from "@/server/groups/queries";
import { requirePermission } from "@/server/session";
import { GroupsView } from "./groups-view";

export const metadata = { title: "Группы" };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ archived?: string; create?: string }> }) {
  const user = await requirePermission("groups.view");
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const canManage = can(user.role, "groups.manage");
  const [groups, teachers] = await Promise.all([
    groupList(user, localDateOf(now()), archived),
    canManage ? prisma.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, subjects: true } }) : [],
  ]);
  return (
    <>
      <PageHeader title="Группы" description={user.role === "TEACHER" ? "Ваши группы: состав, расписание и посещаемость." : undefined} />
      <GroupsView groups={groups} teachers={teachers} canManage={canManage} archived={archived} createOpen={sp.create === "1"} />
    </>
  );
}
