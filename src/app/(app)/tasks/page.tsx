import { PageHeader } from "@/components/layout/page-header";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { assignees, listTasks, type TaskFilters } from "@/server/tasks/service";
import { TasksView } from "./tasks-view";

export const metadata = { title: "Задачи" };

type Search = Record<string, string | undefined>;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("tasks.view");
  const sp = await searchParams;
  const filters: TaskFilters = {
    assigneeId: sp.assignee || undefined,
    due: sp.due === "overdue" || sp.due === "today" || sp.due === "week" ? sp.due : undefined,
    type: sp.type || undefined,
    auto: sp.auto === "1" ? true : sp.auto === "0" ? false : undefined,
    clientId: sp.client || undefined,
    leadId: sp.lead || undefined,
  };
  const at = now();
  const [tasks, people, clients, leads] = await Promise.all([
    listTasks(prisma, user, filters, at),
    user.role === "TEACHER" ? Promise.resolve([]) : assignees(prisma),
    user.role === "TEACHER"
      ? Promise.resolve([])
      : prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    user.role === "TEACHER"
      ? Promise.resolve([])
      : prisma.lead.findMany({ where: { stage: { notIn: ["WON", "LOST"] } }, select: { id: true, childName: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="Задачи" description={user.role === "TEACHER" ? "Ваши задачи" : undefined} />
      <TasksView
        tasks={tasks}
        view={sp.view === "board" ? "board" : "list"}
        filters={filters}
        people={people}
        clients={clients}
        leads={leads.map((l) => ({ id: l.id, fullName: l.childName }))}
        me={user.id}
        isTeacher={user.role === "TEACHER"}
        createOpen={sp.create === "1"}
        createDefaults={{ clientId: sp.client, leadId: sp.lead }}
        openTaskId={sp.task}
        nowIso={at.toISOString()}
      />
    </>
  );
}
