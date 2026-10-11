import { addDays, firstOfMonth, lastOfMonth, localDateOf, nextMonth, parseLocalDate } from "@/domain/calendar";
import { PageHeader } from "@/components/layout/page-header";
import { loadSettings } from "@/server/billing/settings";
import { invoicesForMonth } from "@/server/billing/queries";
import { loadTariffs } from "@/server/lessons/context";
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
  const [data, tariffs] = await Promise.all([invoicesForMonth(target.year, target.month), loadTariffs(prisma)]);
  const current = tariffs
    .filter((x) => x.validFrom <= today)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    .filter((x, i, arr) => arr.findIndex((y) => y.kind === x.kind && y.program === x.program && y.paymentMode === x.paymentMode) === i);

  return (
    <>
      <PageHeader
        title="Абонементы на месяц"
        description={`Счета формируются ${settings.invoiceDay}-го числа на следующий месяц, оплата до ${String(settings.invoiceDueDay).padStart(2, "0")}-го. Родителям — только после проверки.`}
      />
      <SubscriptionsView
        year={target.year}
        month={target.month}
        today={today}
        prevMonth={addDays(firstOfMonth(target.year, target.month), -1).slice(0, 7)}
        nextMonth={addDays(lastOfMonth(target.year, target.month), 1).slice(0, 7)}
        data={data}
        tariffs={current}
      />
    </>
  );
}
