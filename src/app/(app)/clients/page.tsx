import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/access";
import { clientList } from "@/server/clients/queries";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { ClientsTable } from "./clients-table";
import { parseClientFilters } from "./filters";

export const metadata = { title: "Клиенты" };

type Search = Record<string, string | undefined>;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("clients.view");
  const sp = await searchParams;
  const filters = parseClientFilters(sp);
  const [rows, teachers] = await Promise.all([
    clientList(user, filters),
    user.role === "TEACHER"
      ? Promise.resolve([])
      : prisma.teacher.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Клиенты" description={user.role === "TEACHER" ? "Ваши ученики" : undefined} />
      <ClientsTable
        rows={rows}
        filters={filters}
        teachers={teachers}
        perms={{
          create: can(user.role, "clients.create"),
          edit: can(user.role, "clients.edit"),
          money: can(user.role, "finance.payments"),
        }}
      />
    </>
  );
}
