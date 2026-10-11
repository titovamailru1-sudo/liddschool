import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { localDateOf } from "@/domain/calendar";
import { formatLocalDate } from "@/domain/format";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { listPlans, nextMonthStart } from "@/server/payroll/rates";
import { requirePermission } from "@/server/session";
import { RatePlans } from "./rate-plans";

export const metadata = { title: "Шаблоны ставок" };

export default async function RatesPage() {
  await requirePermission("teachers.rates");
  const today = localDateOf(now());
  const plans = await listPlans(prisma, today);
  return (
    <>
      <Link href="/teachers" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Педагоги
      </Link>
      <PageHeader
        title="Шаблоны ставок"
        description={`Изменения вступают в силу с ${formatLocalDate(nextMonthStart(today))} — текущий месяц считается по прежним ставкам.`}
      />
      <RatePlans plans={plans} />
    </>
  );
}
