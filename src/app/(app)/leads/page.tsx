import { UserPlus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Лиды" };

export default async function Page() {
  await requirePermission("leads.view");
  return (
    <>
      <PageHeader title="Лиды" />
      <EmptyState
        icon={UserPlus}
        title="Заявок пока нет"
        hint="Добавьте первую заявку через «+ Создать → Лид». Воронка и карточка лида — этап 5."
      />
    </>
  );
}
