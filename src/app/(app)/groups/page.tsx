import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Группы" };

export default async function Page() {
  await requirePermission("groups.view");
  return (
    <>
      <PageHeader title="Группы" />
      <EmptyState
        icon={Users}
        title="Список групп — этап 3"
        hint="Состав, расписание и журнал посещаемости групп появятся на следующих этапах."
      />
    </>
  );
}
