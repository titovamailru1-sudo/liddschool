import Link from "next/link";
import { Banknote, ChartColumn, HandCoins, Receipt, Wallet, WalletCards, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { financeTabsFor, type FinanceTab } from "@/lib/access";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Финансы" };

const TAB_CONTENT: Record<FinanceTab, { icon: LucideIcon; title: string; hint: string }> = {
  payments: { icon: Banknote, title: "Платежей пока нет", hint: "Примите первую оплату через «+ Создать → Платёж» — этап 3." },
  debts: { icon: HandCoins, title: "Должников нет", hint: "Клиенты с отрицательным балансом появятся здесь — этап 3." },
  expenses: { icon: Receipt, title: "Расходов пока нет", hint: "Аренда, реклама, материалы — по статьям, этап 5." },
  payroll: { icon: WalletCards, title: "Ведомость пуста", hint: "Начисления педагогам по проведённым урокам — этап 4." },
  reports: { icon: ChartColumn, title: "Отчётов пока нет", hint: "Выручка, зарплаты, расходы и прибыль — этап 5." },
  my: { icon: Wallet, title: "Начислений пока нет", hint: "Здесь появится сумма за месяц и начисление по каждому уроку — этап 4." },
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("finance.view");
  const tabs = financeTabsFor(user.role);
  const { tab } = await searchParams;
  // Вкладка из адреса учитывается только если она разрешена роли.
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const content = TAB_CONTENT[active.key];

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
      <EmptyState icon={content.icon} title={content.title} hint={content.hint} />
    </>
  );
}
