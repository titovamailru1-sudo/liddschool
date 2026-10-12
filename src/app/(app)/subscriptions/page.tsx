import { addDays, firstOfMonth, lastOfMonth, localDateOf, nextMonth, parseLocalDate } from "@/domain/calendar";
import Link from "next/link";
import { Tags } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { loadSettings } from "@/server/billing/settings";
import { invoicesForMonth } from "@/server/billing/queries";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { SubscriptionsView } from "./subscriptions-view";

export const metadata = { title: "Абонементы" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePermission("subscriptions.view");
  const sp = await searchParams;
  const today = localDateOf(now());
  const settings = await loadSettings(prisma);

  // По умолчанию: с 20-го — следующий месяц (готовим счета), раньше — текущий.
  const t = parseLocalDate(today);
  let target = t.day >= Math.min(settings.invoiceDay, 20) ? nextMonth(t.year, t.month) : { year: t.year, month: t.month };
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    if (m >= 1 && m <= 12) target = { year: y, month: m };
  }
  const data = await invoicesForMonth(target.year, target.month);

  return (
    <>
      <PageHeader
        title="Абонементы на месяц"
        description={`Счета формируются ${settings.invoiceDay}-го числа на следующий месяц, оплата до ${String(settings.invoiceDueDay).padStart(2, "0")}-го. Родителям — только после проверки.`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/subscriptions/tariffs">
              <Tags /> Тарифы
            </Link>
          </Button>
        }
      />
      <SubscriptionsView
        year={target.year}
        month={target.month}
        today={today}
        prevMonth={addDays(firstOfMonth(target.year, target.month), -1).slice(0, 7)}
        nextMonth={addDays(lastOfMonth(target.year, target.month), 1).slice(0, 7)}
        data={data}
      />
    </>
  );
}
