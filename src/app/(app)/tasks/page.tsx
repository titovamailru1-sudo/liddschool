import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Задачи" };

export default async function Page() {
  await requirePermission("tasks.view");
  return (
    <>
      <PageHeader title="Задачи" />
      <EmptyState
        icon={ClipboardList}
        title="Задач пока нет"
        hint="Создайте задачу через «+ Создать → Задача». Автозадачи (долги, неотмеченные уроки, лиды) появятся на этапе 5."
      />
    </>
  );
}
