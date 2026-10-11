import Link from "next/link";
import { ChartColumn, Receipt, Wallet, WalletCards, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { addDays, firstOfMonth, localDateOf, parseLocalDate } from "@/domain/calendar";
import { financeTabsFor, type FinanceTab } from "@/lib/access";
import { cn } from "@/lib/utils";
import { debtors, paymentsJournal, staffList } from "@/server/billing/queries";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { DebtsTab, PaymentsTab } from "./finance-tabs";

export const metadata = { title: "Финансы" };

const PLACEHOLDER: Partial<Record<FinanceTab, { icon: LucideIcon; title: string; hint: string }>> = {
  expenses: { icon: Receipt, title: "Расходов пока нет", hint: "Аренда, реклама, материалы — по статьям, этап 5." },
  payroll: { icon: WalletCards, title: "Ведомость пуста", hint: "Начисления педагогам по проведённым урокам — этап 4." },
  reports: { icon: ChartColumn, title: "Отчётов пока нет", hint: "Выручка, зарплаты, расходы и прибыль — этап 5." },
  my: { icon: Wallet, title: "Начислений пока нет", hint: "Здесь появится сумма за месяц и начисление по каждому уроку — этап 4." },
};

type Search = Record<string, string | undefined>;
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("finance.view");
  const tabs = financeTabsFor(user.role);
  const sp = await searchParams;
  // Вкладка из адреса учитывается только если она разрешена роли.
  const active = tabs.find((t) => t.key === sp.tab) ?? tabs[0];
  const today = localDateOf(now());

  let body: React.ReactNode;
  if (active.key === "payments") {
    const { year, month } = parseLocalDate(today);
    const filters = {
      from: isDate(sp.from) ? sp.from! : firstOfMonth(year, month),
      to: isDate(sp.to) ? sp.to! : today,
      method: sp.method as never,
      clientId: sp.client,
      receivedById: sp.by,
    };
    const [journal, staff, clients] = await Promise.all([
      paymentsJournal(filters),
      staffList(),
      prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    ]);
    body = <PaymentsTab journal={journal} filters={filters} staff={staff} clients={clients} today={today} />;
  } else if (active.key === "debts") {
    body = <DebtsTab rows={await debtors()} today={today} weekAgo={addDays(today, -7)} />;
  } else {
    const p = PLACEHOLDER[active.key]!;
    body = <EmptyState icon={p.icon} title={p.title} hint={p.hint} />;
  }

  return (
    <>
      <PageHeader title="Финансы" />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Разделы финансов">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/finance?tab=${t.key}`}
            aria-current={t.key === active.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-text-secondary hover:text-text-primary",
              t.key === active.key && "border-brand text-brand-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
