"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2Icon, Lock } from "lucide-react";
import { toast } from "sonner";
import { HoursBar } from "@/components/payroll/hours-bar";
import { PAYROLL_STATUS, PayrollDetail, tierHint } from "@/components/payroll/payroll-detail";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatHours, formatRub, monthName } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { TeacherMonth } from "@/server/payroll/payroll";
import { closePayrollMonthAction } from "./payroll-actions";

function MonthNav({ month, prev, next, tab }: { month: string; prev: string; next: string; tab: string }) {
  const router = useRouter();
  const m = Number(month.slice(5, 7));
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Предыдущий месяц" onClick={() => router.push(`/finance?tab=${tab}&month=${prev}`)}>
        <ChevronLeft />
      </Button>
      <h2 className="min-w-36 text-center text-base font-semibold capitalize">
        {monthName(m)} {month.slice(0, 4)}
      </h2>
      <Button variant="outline" size="icon" aria-label="Следующий месяц" onClick={() => router.push(`/finance?tab=${tab}&month=${next}`)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

/** «Финансы → Зарплаты»: ведомость всех педагогов за месяц (только владелец). */
export function PayrollSheetView({ rows, month, prev, next, today }: { rows: TeacherMonth[]; month: string; prev: string; next: string; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sum = (f: (r: TeacherMonth) => number) => rows.reduce((s, r) => s + f(r), 0);
  const ended = rows[0]?.ended ?? false;
  const openRows = rows.filter((r) => r.status === "OPEN");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} prev={prev} next={next} tab="payroll" />
        {ended && openRows.length > 0 && (
          <Button
            className="ml-auto"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await closePayrollMonthAction(
                  openRows.map((x) => x.teacher.id),
                  Number(month.slice(0, 4)),
                  Number(month.slice(5, 7)),
                );
                if (r.ok) toast.success(r.message ?? "Месяц закрыт");
                else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <Lock />} Закрыть месяц для всех ({openRows.length})
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label={ended ? "Начислено за месяц" : "Начислено на сегодня"} value={formatRub(sum((r) => r.totals.total))} />
        {!ended && <Kpi label="Прогноз по расписанию" value={formatRub(sum((r) => r.forecast.total + r.totals.adjustments))} />}
        <Kpi label="Выплачено" value={formatRub(sum((r) => r.totals.paid))} />
        <Kpi label="К выплате" value={formatRub(sum((r) => Math.max(0, r.totals.toPay)))} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-left text-text-secondary">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Педагог</th>
              <th className="px-3 py-2.5 font-medium">Часы и надбавка</th>
              <th className="px-3 py-2.5 text-right font-medium">Уроков</th>
              <th className="px-3 py-2.5 text-right font-medium">Начислено</th>
              <th className="px-3 py-2.5 text-right font-medium">Надбавка</th>
              <th className="px-3 py-2.5 text-right font-medium">Премии / штрафы</th>
              <th className="px-3 py-2.5 text-right font-medium">Итого</th>
              <th className="px-3 py-2.5 text-right font-medium">Выплачено</th>
              <th className="px-3 py-2.5 text-right font-medium">К выплате</th>
              <th className="px-3 py-2.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.teacher.id;
              const st = PAYROLL_STATUS[r.status];
              const base = r.snapshot ? r.snapshot.baseAmount : r.actual.baseAmount;
              const bonus = r.snapshot ? r.snapshot.bonusAmount : r.actual.bonusAmount;
              return (
                <Fragment key={r.teacher.id}>
                  <tr className={cn("cursor-pointer border-t hover:bg-subtle/60", isOpen && "bg-subtle/60")} onClick={() => setOpen(isOpen ? null : r.teacher.id)}>
                    <td className="px-3 py-2.5">
                      <ChevronDown className={cn("size-4 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                    </td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: r.teacher.color }} />
                        {r.teacher.fullName}
                      </span>
                    </td>
                    <td className="min-w-48 px-3 py-2.5">
                      <div className="text-xs">
                        {formatHours(r.actual.hours)} ч<span className="text-text-secondary"> · {tierHint(r.progress)}</span>
                      </div>
                      <HoursBar hours={r.actual.hours} forecastHours={r.ended ? undefined : r.forecast.hours} tiers={r.plan.tiers} showPercents={false} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.lessons.length}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatRub(base)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{bonus ? formatRub(bonus) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.totals.adjustments ? formatRub(r.totals.adjustments) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatRub(r.totals.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.totals.paid ? formatRub(r.totals.paid) : "—"}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", r.totals.toPay > 0 && r.status !== "OPEN" && "font-semibold text-danger")}>
                      {formatRub(r.totals.toPay)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t bg-canvas">
                      <td colSpan={11} className="p-4">
                        <PayrollDetail view={r} canManage today={today} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** «Мой заработок» для педагога: только свои данные, без действий. */
export function MyEarningsView({ view, month, prev, next, today }: { view: TeacherMonth; month: string; prev: string; next: string; today: string }) {
  return (
    <div className="space-y-4">
      <MonthNav month={month} prev={prev} next={next} tab="my" />
      <PayrollDetail view={view} canManage={false} today={today} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
