import { GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { localDateOf, parseLocalDate } from "@/domain/calendar";
import { monthName } from "@/domain/format";
import { can } from "@/lib/access";
import { now } from "@/server/clock";
import { teachersOverview } from "@/server/payroll/queries";
import { requirePermission } from "@/server/session";
import { TeachersTable } from "./teachers-table";

export const metadata = { title: "Педагоги" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requirePermission("teachers.view");
  const { all } = await searchParams;
  const today = localDateOf(now());
  const rows = await teachersOverview(user, today, all === "1");
  const { month } = parseLocalDate(today);

  return (
    <>
      <PageHeader title="Педагоги" description={`Уроки и часы за ${monthName(month)}`} />
      {rows.length === 0 && all !== "1" ? (
        <EmptyState icon={GraduationCap} title="Педагогов пока нет" hint="Добавьте первого педагога кнопкой «+ Педагог»." />
      ) : null}
      <TeachersTable
        rows={rows}
        showInactive={all === "1"}
        perms={{ create: can(user.role, "teachers.create"), rates: can(user.role, "teachers.rates") }}
      />
    </>
  );
}
