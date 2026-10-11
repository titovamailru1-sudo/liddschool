import { User } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Клиенты" };

export default async function Page() {
  await requirePermission("clients.view");
  return (
    <>
      <PageHeader title="Клиенты" />
      <EmptyState
        icon={User}
        title="Список клиентов — этап 3"
        hint="Таблица с поиском, фильтрами и карточкой клиента появится на этапе 3. Ученики из сид-данных уже в базе."
      />
    </>
  );
}
