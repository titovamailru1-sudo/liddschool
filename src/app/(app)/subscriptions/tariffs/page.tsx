import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { localDateOf } from "@/domain/calendar";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/access";
import { listTariffs } from "@/server/billing/tariffs";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { TariffsView } from "./tariffs-view";

export const metadata = { title: "Тарифы" };

export default async function TariffsPage() {
  const user = await requirePermission("subscriptions.view");
  const today = localDateOf(now());
  const tariffs = await listTariffs(prisma, today);
  return (
    <>
      <Link href="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Абонементы
      </Link>
      <PageHeader
        title="Тарифы"
        description="Цена за урок-час. Тарифы школы действуют для всех учеников без своего тарифа; свой тариф выбирается в карточке ученика."
      />
      <TariffsView tariffs={tariffs} today={today} canManage={can(user.role, "tariffs.manage")} />
    </>
  );
}
