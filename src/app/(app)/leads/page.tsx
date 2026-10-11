import { PageHeader } from "@/components/layout/page-header";
import { firstOfMonth, lastOfMonth, localDateOf, parseLocalDate } from "@/domain/calendar";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { leadStats, listLeads } from "@/server/leads/service";
import { lessonFormOptions } from "@/server/lessons/queries";
import { requirePermission } from "@/server/session";
import { assignees } from "@/server/tasks/service";
import { LeadsView } from "./leads-view";

export const metadata = { title: "Лиды" };

type Search = Record<string, string | undefined>;
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("leads.view");
  const sp = await searchParams;
  const at = now();
  const today = localDateOf(at);
  const { year, month } = parseLocalDate(today);
  const from = isDate(sp.from) ? sp.from! : firstOfMonth(year, month);
  const to = isDate(sp.to) ? sp.to! : lastOfMonth(year, month);
  const source = ["SITE", "AVITO", "VK", "REFERRAL", "OTHER"].includes(sp.source ?? "") ? (sp.source as "SITE") : undefined;

  const [leads, stats, people, options] = await Promise.all([
    listLeads(prisma, { q: sp.q?.trim() || undefined, source, ownerId: sp.owner || undefined }, at),
    leadStats(prisma, from, to),
    assignees(prisma),
    lessonFormOptions(user),
  ]);

  return (
    <>
      <PageHeader title="Лиды" />
      <LeadsView
        leads={leads}
        stats={stats}
        period={{ from, to }}
        view={sp.view === "table" ? "table" : "board"}
        filters={{ q: sp.q, source, owner: sp.owner }}
        staff={people.filter((p) => p.role !== "TEACHER")}
        teachers={options.teachers.map((t) => ({ id: t.id, fullName: t.fullName, subjects: t.subjects }))}
        openLeadId={sp.lead}
        createOpen={sp.create === "1"}
        today={today}
        me={user.id}
      />
    </>
  );
}
