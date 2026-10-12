"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Copy, FileText, Loader2Icon, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { InvoiceStatusBadge, MESSAGE_STATUS } from "@/components/billing/invoice-status";
import { PaymentDialog, type PaymentTarget } from "@/components/billing/payment-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRub, monthName } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { MonthInvoices } from "@/server/billing/queries";
import { deleteDraftAction, generateDraftsAction, issueInvoicesAction, rebuildDraftAction, retryMessageAction } from "./actions";

type Invoice = MonthInvoices["invoices"][number];

export function SubscriptionsView({
  year,
  month,
  today,
  prevMonth,
  nextMonth,
  data,
}: {
  year: number;
  month: number;
  today: string;
  prevMonth: string;
  nextMonth: string;
  data: MonthInvoices;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [payFor, setPayFor] = useState<PaymentTarget | null>(null);

  const drafts = data.invoices.filter((i) => i.status === "DRAFT");
  const issued = data.invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");
  const sum = (xs: Invoice[], f: (i: Invoice) => number) => xs.reduce((s, i) => s + f(i), 0);
  const title = `${monthName(month)[0].toUpperCase()}${monthName(month).slice(1)} ${year}`;

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Готово");
      else toast.error(r.error ?? "Не удалось");
      setSelected(new Set());
    });

  const selectedDrafts = drafts.filter((d) => selected.has(d.id)).map((d) => d.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Предыдущий месяц" onClick={() => router.push(`/subscriptions?month=${prevMonth}`)}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-40 text-center text-base font-semibold">{title}</h2>
        <Button variant="outline" size="icon" aria-label="Следующий месяц" onClick={() => router.push(`/subscriptions?month=${nextMonth}`)}>
          <ChevronRight />
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => act(() => generateDraftsAction({ year, month }))}>
            <RefreshCw /> Сформировать черновики
          </Button>
          <Button
            disabled={pending || !drafts.length}
            onClick={() => act(() => issueInvoicesAction(selectedDrafts.length ? selectedDrafts : drafts.map((d) => d.id)))}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <Send />}
            {selectedDrafts.length ? `Отправить выбранные (${selectedDrafts.length})` : `Отправить все черновики (${drafts.length})`}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Счетов" value={String(data.invoices.length)} hint={drafts.length ? `черновиков: ${drafts.length}` : undefined} />
        <Kpi label="К оплате по выставленным" value={formatRub(sum(issued, (i) => i.total))} />
        <Kpi label="Оплачено" value={formatRub(sum(issued, (i) => Math.min(i.paid, i.total)))} />
        <Kpi label="Выгода семей от абонемента" value={formatRub(sum(data.invoices, (i) => i.perLessonAmount - i.amount))} />
      </div>

      {data.invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-surface px-6 py-12 text-center text-sm text-text-secondary">
          Счетов на этот месяц нет. Нажмите «Сформировать черновики» — система посчитает уроки каждого ученика на абонементе по расписанию.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    aria-label="Выбрать все черновики"
                    checked={drafts.length > 0 && drafts.every((d) => selected.has(d.id))}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(drafts.map((d) => d.id)) : new Set())}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Ученик</th>
                <th className="px-3 py-2.5 text-right font-medium">Уроков</th>
                <th className="px-3 py-2.5 text-right font-medium">Абонемент</th>
                <th className="px-3 py-2.5 text-right font-medium">Перерасчёт</th>
                <th className="px-3 py-2.5 text-right font-medium">Долг / переплата</th>
                <th className="px-3 py-2.5 text-right font-medium">Итого</th>
                <th className="px-3 py-2.5 text-right font-medium">Оплачено</th>
                <th className="px-3 py-2.5 font-medium">Статус</th>
                <th className="px-3 py-2.5 font-medium">Сообщение</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2.5">
                    {i.status === "DRAFT" && (
                      <Checkbox
                        aria-label={`Выбрать ${i.clientName}`}
                        checked={selected.has(i.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v === true) next.add(i.id);
                          else next.delete(i.id);
                          setSelected(next);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                    <Link href={`/clients/${i.clientId}?tab=invoices`} className="hover:text-brand-text hover:underline">
                      {i.clientName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{i.lessonsCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatRub(i.amount)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", i.adjustmentsTotal < 0 && "text-done")} title={i.adjustments.map((a) => a.reason).join("; ")}>
                    {i.adjustments.length ? formatRub(i.adjustmentsTotal) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {i.debtIncluded ? <span className="text-danger">+{formatRub(i.debtIncluded)}</span> : i.creditApplied ? <span className="text-done">−{formatRub(i.creditApplied)}</span> : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatRub(i.total)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{i.paid ? formatRub(i.paid) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <InvoiceStatusBadge status={i.status} charged={i.charged} />
                  </td>
                  <td className="px-3 py-2.5">
                    {i.message ? (
                      <StatusBadge tone={MESSAGE_STATUS[i.message.status].tone}>{MESSAGE_STATUS[i.message.status].label}</StatusBadge>
                    ) : (
                      <span className="text-xs text-text-secondary">{i.telegramLinked ? "Telegram подключён" : "нет Telegram"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" title="Просмотр и отправка" aria-label={`Просмотр: ${i.clientName}`} onClick={() => setPreview(i)}>
                        <FileText />
                      </Button>
                      {i.status !== "DRAFT" && i.status !== "PAID" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Принять оплату"
                          aria-label={`Принять оплату: ${i.clientName}`}
                          onClick={() =>
                            setPayFor({
                              clientId: i.clientId,
                              clientName: i.clientName,
                              invoices: [{ id: i.id, label: `Абонемент: ${title}`, due: Math.max(0, i.total - i.paid) }],
                            })
                          }
                        >
                          <Wallet />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.withoutInvoice.length > 0 && (
        <div className="rounded-lg border bg-surface p-4 text-sm">
          <div className="mb-2 font-medium">Без счёта на {monthName(month)}: {data.withoutInvoice.length}</div>
          <p className="mb-3 text-text-secondary">Ученики на абонементе без уроков в этом месяце или добавленные после формирования.</p>
          <div className="flex flex-wrap gap-2">
            {data.withoutInvoice.map((c) => (
              <Button key={c.id} variant="outline" size="sm" disabled={pending} onClick={() => act(() => rebuildDraftAction(c.id, { year, month }))}>
                {c.fullName}: сформировать
              </Button>
            ))}
          </div>
        </div>
      )}


      <PreviewDialog invoice={preview} onClose={() => setPreview(null)} year={year} month={month} />
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} target={payFor} today={today} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}

function PreviewDialog({ invoice, onClose, year, month }: { invoice: Invoice | null; onClose: () => void; year: number; month: number }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, close = false) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Готово");
      else toast.error(r.error ?? "Не удалось");
      if (close || r.ok) onClose();
    });

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {invoice && (
          <>
            <DialogHeader>
              <DialogTitle>{invoice.clientName}</DialogTitle>
              <DialogDescription>
                Сообщение родителю {invoice.telegramLinked ? "уйдёт в Telegram" : "— Telegram не подключён: текст можно скопировать и отправить вручную"}
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-80 overflow-y-auto rounded-md border bg-subtle p-3 font-sans text-sm whitespace-pre-wrap">{invoice.messageText}</pre>
            {invoice.message?.error && <p className="text-sm text-warning">{invoice.message.error}</p>}
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(invoice.messageText ?? "");
                    toast.success("Текст скопирован");
                  }}
                >
                  <Copy /> Копировать
                </Button>
                {invoice.status === "DRAFT" && (
                  <>
                    <Button variant="outline" disabled={pending} onClick={() => run(() => rebuildDraftAction(invoice.clientId, { year, month }))}>
                      <RefreshCw /> Пересчитать
                    </Button>
                    <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => run(() => deleteDraftAction(invoice.id))}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
              {invoice.status === "DRAFT" ? (
                <Button disabled={pending} onClick={() => run(() => issueInvoicesAction([invoice.id]))}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <Send />} Отправить
                </Button>
              ) : (
                invoice.message &&
                invoice.message.status !== "SENT" && (
                  <Button disabled={pending} onClick={() => run(() => retryMessageAction(invoice.message!.id))}>
                    <Send /> Отправить повторно
                  </Button>
                )
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
