"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Banknote, HandCoins, Plus, Wallet } from "lucide-react";
import { CancelPaymentButton } from "@/components/billing/cancel-payment-button";
import { PaymentDialog, PAYMENT_METHODS, type PaymentTarget } from "@/components/billing/payment-dialog";
import { EmptyState } from "@/components/empty-state";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateOf } from "@/domain/calendar";
import { formatDate, formatDayMonth, formatLocalDate, formatRub, monthName } from "@/domain/format";
import { PAYMENT_MODE_LABEL } from "@/lib/status";
import type { debtors, paymentsJournal } from "@/server/billing/queries";

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<string, string>;

type Journal = Awaited<ReturnType<typeof paymentsJournal>>;

export function PaymentsTab({
  journal,
  filters,
  staff,
  clients,
  today,
}: {
  journal: Journal;
  filters: { from: string; to: string; method?: string; clientId?: string; receivedById?: string };
  staff: { id: string; name: string }[];
  clients: { id: string; fullName: string }[];
  today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("pay") === "1");
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`/finance?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-text-secondary" htmlFor="f-from">С</label>
          <Input id="f-from" type="date" className="h-9 w-40" value={filters.from} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary" htmlFor="f-to">По</label>
          <Input id="f-to" type="date" className="h-9 w-40" value={filters.to} onChange={(e) => set("to", e.target.value)} />
        </div>
        <Select value={filters.method ?? "all"} onValueChange={(v) => set("method", v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-40" aria-label="Способ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Способ: все</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-52">
          <SearchableSelect options={clients.map((c) => ({ value: c.id, label: c.fullName }))} value={filters.clientId ?? null} onChange={(v) => set("client", v)} placeholder="Клиент: все" />
        </div>
        <Select value={filters.receivedById ?? "all"} onValueChange={(v) => set("by", v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-44" aria-label="Кто принял">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Принял: все</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus /> Принять оплату
        </Button>
      </div>

      <div className="rounded-lg border bg-surface px-4 py-3 text-sm">
        За период {formatLocalDate(filters.from)} – {formatLocalDate(filters.to)}: <b>{formatRub(journal.total)}</b>
        <span className="text-text-secondary"> · платежей: {journal.count}</span>
      </div>

      {journal.rows.length === 0 ? (
        <EmptyState icon={Banknote} title="Платежей за период нет" hint="Примите оплату кнопкой «Принять оплату» или измените период." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Дата</th>
                <th className="px-4 py-2.5 font-medium">Клиент</th>
                <th className="px-4 py-2.5 text-right font-medium">Сумма</th>
                <th className="px-4 py-2.5 font-medium">Способ</th>
                <th className="px-4 py-2.5 font-medium">Назначение</th>
                <th className="px-4 py-2.5 font-medium">Принял</th>
                <th className="px-4 py-2.5 font-medium">Комментарий</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {journal.rows.map((r) => (
                <tr key={r.id} className={r.cancelled ? "border-t text-text-secondary line-through" : "border-t"}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(new Date(r.paidAt))}</td>
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/clients/${r.clientId}?tab=payments`} className="hover:underline">
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatRub(r.amount)}</td>
                  <td className="px-4 py-2.5">{METHOD[r.method]}</td>
                  <td className="px-4 py-2.5">
                    {r.purpose.kind === "invoice"
                      ? `Абонемент, ${monthName(Number(r.purpose.month.slice(5, 7)))}`
                      : r.purpose.kind === "lesson"
                        ? `Урок ${formatDayMonth(localDateOf(new Date(r.purpose.at)))}`
                        : "Пополнение баланса"}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.receivedBy ?? "—"}</td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-text-secondary" title={r.cancelled ?? r.comment ?? ""}>
                    {r.cancelled ? `Отменён: ${r.cancelled}` : (r.comment ?? "")}
                  </td>
                  <td className="px-4 py-2.5">
                    {!r.cancelled && <CancelPaymentButton paymentId={r.id} amount={r.amount} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaymentDialog open={open} onOpenChange={setOpen} target={null} clients={clients} today={today} />
    </div>
  );
}

type Debt = Awaited<ReturnType<typeof debtors>>[number];

export function DebtsTab({ rows, today, weekAgo }: { rows: Debt[]; today: string; weekAgo: string }) {
  const [payFor, setPayFor] = useState<PaymentTarget | null>(null);
  const total = rows.reduce((s, r) => s + r.debt, 0);
  if (!rows.length) return <EmptyState icon={HandCoins} title="Должников нет" hint="Клиенты с отрицательным балансом появятся здесь автоматически." />;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-surface px-4 py-3 text-sm">
        Должников: <b>{rows.length}</b> · сумма долгов: <b className="text-danger">{formatRub(total)}</b>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-medium">Клиент</th>
              <th className="px-4 py-2.5 font-medium">Оплата</th>
              <th className="px-4 py-2.5 font-medium">Родитель</th>
              <th className="px-4 py-2.5 text-right font-medium">Долг</th>
              <th className="px-4 py-2.5 font-medium">Последняя оплата</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stale = !r.lastPaymentAt || localDateOf(new Date(r.lastPaymentAt)) < weekAgo;
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/clients/${r.id}?tab=payments`} className="hover:underline">
                      {r.fullName}
                    </Link>
                    {r.status !== "ACTIVE" && <StatusBadge tone="cancelled" className="ml-2">{r.status === "PAUSED" ? "пауза" : "архив"}</StatusBadge>}
                  </td>
                  <td className="px-4 py-2.5">{PAYMENT_MODE_LABEL[r.paymentMode]}</td>
                  <td className="px-4 py-2.5">
                    {r.parent ? (
                      <>
                        {r.parent.fullName}
                        <a className="block text-xs text-text-secondary hover:underline" href={`tel:${r.parent.phone.replace(/[^\d+]/g, "")}`}>
                          {r.parent.phone}
                        </a>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-danger tabular-nums">{formatRub(r.debt)}</td>
                  <td className={stale ? "px-4 py-2.5 text-warning" : "px-4 py-2.5"}>
                    {r.lastPaymentAt ? formatDate(new Date(r.lastPaymentAt)) : "не было"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setPayFor({ clientId: r.id, clientName: r.fullName, amount: r.debt })}>
                      <Wallet /> Принять оплату
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} target={payFor} today={today} />
    </div>
  );
}
