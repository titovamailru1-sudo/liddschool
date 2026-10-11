"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Loader2Icon, Plus, Receipt, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ColumnChart, LineChart, ShareBar } from "@/components/charts/charts";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changePercent, type PeriodKind } from "@/domain/crm";
import { formatHours, formatLocalDate, formatRub } from "@/domain/format";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { FullReport } from "@/server/reports";
import { addExpenseAction, cancelExpenseAction } from "./expense-actions";

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function usePeriodNav() {
  const router = useRouter();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/finance?${next.toString()}`, { scroll: false });
  };
}

function PeriodBar({ kind, from, to, exportHref }: { kind: PeriodKind; from: string; to: string; exportHref?: string }) {
  const nav = usePeriodNav();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="Период">
        {(
          [
            ["week", "Неделя"],
            ["month", "Месяц"],
            ["quarter", "Квартал"],
            ["custom", "Произвольный"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => nav({ period: k, from: k === "custom" ? from : null, to: k === "custom" ? to : null, at: null })}
            className={cn("h-8 rounded-md px-3 text-sm font-medium text-text-secondary", kind === k && "bg-brand-soft text-brand-text")}
          >
            {l}
          </button>
        ))}
      </div>
      {kind === "custom" ? (
        <>
          <Input type="date" aria-label="С" className="h-8 w-36" value={from} onChange={(e) => nav({ from: e.target.value })} />
          —
          <Input type="date" aria-label="По" className="h-8 w-36" value={to} onChange={(e) => nav({ to: e.target.value })} />
        </>
      ) : (
        <Input type="date" aria-label="Дата в периоде" className="h-8 w-36" value={from} onChange={(e) => nav({ at: e.target.value })} />
      )}
      <span className="text-sm text-text-secondary">
        {formatLocalDate(from)} – {formatLocalDate(to)}
      </span>
      {exportHref && (
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <a href={exportHref}>
            <Download /> Excel
          </a>
        </Button>
      )}
    </div>
  );
}

function Kpi({ label, value, prev, goodUp = true, money = true, hint }: { label: string; value: number; prev?: number; goodUp?: boolean; money?: boolean; hint?: string }) {
  const d = prev === undefined ? null : changePercent(value, prev);
  const good = d !== null && (goodUp ? d >= 0 : d <= 0);
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{money ? formatRub(value) : value}</div>
      {d !== null && d !== 0 && (
        <div className={cn("inline-flex items-center gap-0.5 text-xs", good ? "text-done" : "text-danger")}>
          {d > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {d > 0 ? "+" : ""}
          {String(d).replace(".", ",")}% к прошлому периоду
        </div>
      )}
      {hint && <div className="text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}

/** «Финансы → Отчёты» (только владелец). */
export function ReportsTab({ report, kind, exportHref }: { report: FullReport; kind: PeriodKind; exportHref: string }) {
  const { current: c, before: b } = report;
  const label = (key: string) => `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
  return (
    <div className="space-y-5">
      <PeriodBar kind={kind} from={report.period.from} to={report.period.to} exportHref={exportHref} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Поступления" value={c.receipts} prev={b.receipts} />
        <Kpi label="Стоимость проведённых уроков" value={c.revenue} prev={b.revenue} />
        <Kpi label="Зарплаты педагогов" value={c.salaries} prev={b.salaries} goodUp={false} hint={c.bonusIncluded ? undefined : "без надбавки — период короче месяца"} />
        <Kpi label="Расходы" value={c.expenses} prev={b.expenses} goodUp={false} />
        <Kpi label="Прибыль" value={c.profit} prev={b.profit} />
        <Kpi label="Активные клиенты" value={report.clients.active} money={false} />
        <Kpi label="Сумма долгов сейчас" value={report.debt} goodUp={false} />
        <Kpi label="Новые / ушедшие клиенты" value={report.clients.newClients} money={false} hint={`ушли: ${report.clients.left} · отток ${String(report.clients.churn).replace(".", ",")}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Выручка и поступления по месяцам</h2>
          <p className="mb-3 text-xs text-text-secondary">Разница — сколько денег пришло раньше или позже уроков (предоплата или долг).</p>
          <LineChart
            ariaLabel="Выручка и поступления по месяцам"
            series={["Выручка (стоимость уроков)", "Поступления"]}
            points={report.series.map((m) => ({ label: label(m.key), values: [m.revenue, m.receipts] }))}
          />
        </section>
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Прибыль по месяцам</h2>
          <p className="mb-3 text-xs text-text-secondary">Выручка − зарплаты − расходы.</p>
          <ColumnChart ariaLabel="Прибыль по месяцам" name="Прибыль" points={report.series.map((m) => ({ label: label(m.key), value: m.profit }))} />
        </section>
      </div>

      <Table
        title="Финансовый итог по месяцам"
        head={["Месяц", "Выручка", "Поступления", "Зарплаты", "Расходы", "Прибыль"]}
        rows={report.series.map((m) => [label(m.key), formatRub(m.revenue), formatRub(m.receipts), formatRub(m.salaries), formatRub(m.expenses), formatRub(m.profit)])}
      />

      <Table
        title="По педагогам"
        head={["Педагог", "Уроков", "Часов", "Выручка", "Зарплата", "Маржа"]}
        rows={report.teachers.map((t) => [t.fullName, String(t.lessons), formatHours(t.hours), formatRub(t.revenue), formatRub(t.salary), formatRub(t.margin)])}
        empty="За период уроков не было."
      />

      <Table
        title="По программам и тарифам"
        head={["Программа", "Формат", "Оплата", "Посещений", "Часов", "Выручка"]}
        rows={report.programs.map((p) => [
          PROGRAM_LABEL[p.program],
          p.kind === "GROUP" ? "Группа" : "Индивидуально",
          PAYMENT_MODE_LABEL[p.paymentMode],
          String(p.visits),
          formatHours(p.hours),
          formatRub(p.revenue),
        ])}
        empty="За период уроков не было."
      />

      <section className="rounded-lg border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Посещаемость · уроков {report.attendance.total}</h2>
        {report.attendance.total ? (
          <ShareBar
            parts={[
              { label: "Проведены", value: report.attendance.counts.done, share: report.attendance.shares.done, color: "var(--done)" },
              { label: "Пропуск неув.", value: report.attendance.counts.unexcused, share: report.attendance.shares.unexcused, color: "var(--danger)" },
              { label: "Пропуск ув.", value: report.attendance.counts.excused, share: report.attendance.shares.excused, color: "var(--warning)" },
              { label: "Отменены школой", value: report.attendance.counts.cancelled, share: report.attendance.shares.cancelled, color: "var(--cancelled)" },
            ]}
          />
        ) : (
          <p className="text-sm text-text-secondary">За период уроков не было.</p>
        )}
        {report.attendance.counts.planned > 0 && <p className="mt-2 text-xs text-text-secondary">Ещё не отмечено: {report.attendance.counts.planned}.</p>}
      </section>
    </div>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: string[][]; empty?: string }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-surface">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">{empty ?? "Нет данных."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                {head.map((h, i) => (
                  <th key={h} className={cn("px-4 py-2 font-medium", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t">
                  {r.map((cell, i) => (
                    <td key={i} className={cn("px-4 py-2", i > 0 && "text-right tabular-nums")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Expenses = {
  total: number;
  byCategory: { category: string; amount: number }[];
  rows: { id: string; date: string; category: string; amount: number; comment: string | null; author: string | null; cancelled: string | null }[];
};

/** «Финансы → Расходы» (только владелец). */
export function ExpensesTab({ data, categories, kind, from, to, today }: { data: Expenses; categories: string[]; kind: PeriodKind; from: string; to: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodBar kind={kind} from={from} to={to} />
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus /> Расход
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-surface px-4 py-3">
          <div className="text-xs text-text-secondary">Всего за период</div>
          <div className="text-lg font-semibold tabular-nums">{formatRub(data.total)}</div>
        </div>
        {data.byCategory.map((c) => (
          <div key={c.category} className="rounded-lg border bg-surface px-4 py-3">
            <div className="text-xs text-text-secondary">{c.category}</div>
            <div className="text-lg font-semibold tabular-nums">{formatRub(c.amount)}</div>
          </div>
        ))}
      </div>
      {data.rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Расходов за период нет" hint="Добавьте расход кнопкой «+ Расход»: аренда, реклама, материалы…" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Дата</th>
                <th className="px-4 py-2.5 font-medium">Статья</th>
                <th className="px-4 py-2.5 text-right font-medium">Сумма</th>
                <th className="px-4 py-2.5 font-medium">Комментарий</th>
                <th className="px-4 py-2.5 font-medium">Внёс</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className={cn("border-t", r.cancelled && "text-text-secondary line-through")}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatLocalDate(r.date)}</td>
                  <td className="px-4 py-2.5">{r.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatRub(r.amount)}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.cancelled ? `Отменён: ${r.cancelled}` : (r.comment ?? "")}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.author ?? "—"}</td>
                  <td className="px-4 py-2.5">{!r.cancelled && <CancelExpense id={r.id} amount={r.amount} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ExpenseDialog open={open} onOpenChange={setOpen} categories={categories} today={today} />
    </div>
  );
}

function ExpenseDialog({ open, onOpenChange, categories, today }: { open: boolean; onOpenChange: (o: boolean) => void; categories: string[]; today: string }) {
  const [category, setCategory] = useState(categories[0] ?? "Прочее");
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Новый расход</DialogTitle>
          <DialogDescription>Ошибочную запись потом можно отменить с причиной.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-cat">Статья</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="ex-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value="__new">+ Своя статья…</SelectItem>
              </SelectContent>
            </Select>
            {category === "__new" && <Input aria-label="Название статьи" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Например, Канцтовары" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-amount">Сумма, ₽</Label>
              <Input id="ex-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-date">Дата</Label>
              <Input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-comment">Комментарий</Label>
            <Textarea id="ex-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={pending || !amount || (category === "__new" && !custom.trim())}
            onClick={() =>
              startTransition(async () => {
                const r = await addExpenseAction({ category: category === "__new" ? custom : category, amount: Number(amount), date, comment: comment || null });
                if (r.ok) {
                  toast.success(r.message ?? "Добавлено");
                  onOpenChange(false);
                  setAmount("");
                  setComment("");
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelExpense({ id, amount }: { id: string; amount: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Отменить расход" title="Отменить ошибочную запись" onClick={() => setOpen(true)}>
        <Undo2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Отменить расход {formatRub(amount)}?</DialogTitle>
            <DialogDescription>Запись останется в истории как отменённая.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Причина" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Назад
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !reason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await cancelExpenseAction(id, reason);
                  if (r.ok) {
                    toast.success(r.message ?? "Отменено");
                    setOpen(false);
                  } else toast.error(r.error);
                })
              }
            >
              Отменить расход
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
