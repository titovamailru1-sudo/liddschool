import { Tag } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Абонементы" };

export default async function Page() {
  await requirePermission("subscriptions.view");
  return (
    <>
      <PageHeader title="Абонементы" />
      <EmptyState
        icon={Tag}
        title="Счетов на месяц пока нет"
        hint="25 числа система сформирует счета на следующий месяц по расписанию учеников — этап 3."
      />
    </>
  );
}
