import Link from "next/link";
import { Wallet, WalletCards } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { addDays, firstOfMonth, lastOfMonth, localDateOf, parseLocalDate } from "@/domain/calendar";
import { financeTabsFor } from "@/lib/access";
import { cn } from "@/lib/utils";
import { debtors, paymentsJournal, staffList } from "@/server/billing/queries";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";
import { payrollSheet, teacherMonth } from "@/server/payroll/payroll";
import { expenseCategories, listExpenses } from "@/server/expenses";
import { fullReport } from "@/server/reports";
import { DebtsTab, PaymentsTab } from "./finance-tabs";
import { periodFromParams } from "./period";
import { ExpensesTab, ReportsTab } from "./reports-views";
import { MyEarningsView, PayrollSheetView } from "./payroll-views";

export const metadata = { title: "Финансы" };


/** Месяц из адреса (?month=2026-10) или текущий; соседние — для навигации. */
function monthParam(v: string | undefined, today: string) {
  const { year, month } = parseLocalDate(today);
  let y = year;
  let m = month;
  if (v && /^\d{4}-\d{2}$/.test(v)) {
    const [yy, mm] = v.split("-").map(Number);
    if (mm >= 1 && mm <= 12) [y, m] = [yy, mm];
  }
  const start = firstOfMonth(y, m);
  return { year: y, month: m, key: start.slice(0, 7), prev: addDays(start, -1).slice(0, 7), next: addDays(lastOfMonth(y, m), 1).slice(0, 7) };
}

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
  } else if (active.key === "payroll") {
    const m = monthParam(sp.month, today);
    const rows = await payrollSheet(prisma, m.year, m.month, today);
    body = rows.length ? (
      <PayrollSheetView rows={rows} month={m.key} prev={m.prev} next={m.next} today={today} />
    ) : (
      <EmptyState icon={WalletCards} title="Педагогов пока нет" hint="Добавьте педагога в разделе «Педагоги»." />
    );
  } else if (active.key === "my") {
    const m = monthParam(sp.month, today);
    body = user.teacherId ? (
      <MyEarningsView view={await teacherMonth(prisma, user.teacherId, m.year, m.month, today)} month={m.key} prev={m.prev} next={m.next} today={today} />
    ) : (
      <EmptyState icon={Wallet} title="Учётная запись не привязана к педагогу" hint="Обратитесь к администратору школы." />
    );
  } else if (active.key === "expenses") {
    const { kind, period } = periodFromParams(sp, today);
    const [data, categories] = await Promise.all([listExpenses(prisma, period.from, period.to), expenseCategories(prisma)]);
    body = <ExpensesTab data={data} categories={categories} kind={kind} from={period.from} to={period.to} today={today} />;
  } else {
    const { kind, period, previous } = periodFromParams(sp, today);
    const report = await fullReport(prisma, period, previous);
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && ["period", "at", "from", "to"].includes(k)) as [string, string][]);
    body = <ReportsTab report={report} kind={kind} exportHref={`/finance/reports/export?${q.toString()}`} />;
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
