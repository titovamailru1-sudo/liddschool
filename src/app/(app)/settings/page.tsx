import { Settings } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Настройки" };

export default async function Page() {
  await requirePermission("settings.manage");
  return (
    <>
      <PageHeader title="Настройки" />
      <EmptyState
        icon={Settings}
        title="Настройки — позже"
        hint="Тарифы, правила переноса, пользователи и роли. Значения по умолчанию уже записаны в базу."
      />
    </>
  );
}
