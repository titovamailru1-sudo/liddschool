"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { retryMessageAction } from "@/app/(app)/subscriptions/actions";
import { CancelPaymentButton } from "@/components/billing/cancel-payment-button";
import { InvoiceStatusBadge, MESSAGE_STATUS } from "@/components/billing/invoice-status";
import { PaymentDialog, PAYMENT_METHODS, type PaymentTarget } from "@/components/billing/payment-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRub, formatTime, monthName } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { ClientFinance } from "@/server/billing/queries";
import type { ClientCard } from "@/server/clients/queries";
import { telegramInviteAction } from "../actions";

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<string, string>;
const LEDGER = {
  PAYMENT: "Оплата",
  LESSON_CHARGE: "Урок",
  INVOICE_CHARGE: "Абонемент",
  CREDIT_TRANSFER: "Перерасчёт",
  REFUND: "Возврат",
  ADJUSTMENT: "Корректировка",
} as Record<string, string>;
const SOURCE = { SITE: "Сайт", AVITO: "Авито", VK: "ВКонтакте", REFERRAL: "Сарафанное радио", OTHER: "Другое" } as Record<string, string>;
const KIND = { invoice: "Счёт за месяц", lesson_payment: "Оплата урока", invoice_reminder: "Напоминание", other: "Сообщение" } as Record<string, string>;

export function ClientProfile({ card, canEdit }: { card: ClientCard; canEdit: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2 rounded-lg border bg-surface p-4 text-sm">
        <h2 className="mb-2 font-semibold">Ученик</h2>
        <Row label="Класс" value={card.grade ? `${card.grade}` : "—"} />
        <Row label="Школа" value={card.school ?? "—"} />
        {card.phone !== null && <Row label="Телефон" value={card.phone || "—"} />}
        <Row label="Цель" value={card.goal ?? "—"} />
        <Row label="Откуда узнали" value={card.source ? SOURCE[card.source] : "—"} />
        {card.notes && (
          <div className="pt-2">
            <div className="text-text-secondary">Заметки</div>
            <p className="whitespace-pre-wrap">{card.notes}</p>
          </div>
        )}
      </section>

      {card.parents.length > 0 && (
        <section className="rounded-lg border bg-surface p-4 text-sm">
          <h2 className="mb-3 font-semibold">Родители</h2>
          <ul className="space-y-4">
            {card.parents.map((p, i) => (
              <ParentRow key={p.id} parent={p} primary={i === 0} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ParentRow({ parent, primary, canEdit }: { parent: ClientCard["parents"][number]; primary: boolean; canEdit: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li>
      <div className="font-medium">
        {parent.fullName}
        {primary && <span className="ml-2 text-xs font-normal text-text-secondary">основной контакт</span>}
      </div>
      <div className="text-text-secondary">
        {parent.relation && `${parent.relation} · `}
        <a href={`tel:${parent.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
          {parent.phone}
        </a>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {parent.telegramLinkedAt !== null ? (
          <StatusBadge tone="done">Telegram подключён</StatusBadge>
        ) : (
          <StatusBadge tone="cancelled">Telegram не подключён</StatusBadge>
        )}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await telegramInviteAction(parent.id);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message ?? "Готово");
                setLink(r.data?.link ?? null);
              })
            }
          >
            <Send /> {parent.telegramLinkedAt !== null ? "Новая ссылка" : "Пригласить в Telegram"}
          </Button>
        )}
      </div>
      {link && (
        <div className="mt-2 flex items-center gap-2 rounded-md border bg-subtle px-2 py-1.5">
          <code className="flex-1 truncate text-xs">{link}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Копировать ссылку"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast.success("Ссылка скопирована — отправьте её родителю");
            }}
          >
            <Copy />
          </Button>
        </div>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ClientMoney({
  view,
  finance,
  clientId,
  clientName,
  today,
}: {
  view: "invoices" | "payments";
  finance: ClientFinance;
  clientId: string;
  clientName: string;
  today: string;
}) {
  const [payFor, setPayFor] = useState<PaymentTarget | null>(null);

  if (view === "invoices") {
    return (
      <div className="overflow-x-auto rounded-lg border bg-surface">
        {finance.invoices.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">Счетов пока не было.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Месяц</th>
                <th className="px-4 py-2.5 text-right font-medium">Уроков</th>
                <th className="px-4 py-2.5 text-right font-medium">Итого</th>
                <th className="px-4 py-2.5 text-right font-medium">Оплачено</th>
                <th className="px-4 py-2.5 font-medium">Статус</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {finance.invoices.map((i) => {
                const label = `${monthName(Number(i.month.slice(5, 7)))} ${i.month.slice(0, 4)}`;
                return (
                  <tr key={i.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium capitalize">{label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.lessonsCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatRub(i.total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.paid ? formatRub(i.paid) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <InvoiceStatusBadge status={i.status} charged={i.status !== "DRAFT"} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {i.token && i.status !== "DRAFT" && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`/pay/${i.token}`} target="_blank" rel="noreferrer">
                              <ExternalLink /> Страница оплаты
                            </a>
                          </Button>
                        )}
                        {(i.status === "SENT" || i.status === "PARTIALLY_PAID" || i.status === "VIEWED") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPayFor({ clientId, clientName, invoices: [{ id: i.id, label: `Абонемент, ${label}`, due: Math.max(0, i.total - i.paid) }] })
                            }
                          >
                            Оплата
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} target={payFor} today={today} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-lg border bg-surface">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Платежи</h2>
        {finance.payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">Платежей пока не было.</p>
        ) : (
          <ul className="divide-y text-sm">
            {finance.payments.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-3 px-4 py-2.5", p.cancelled && "text-text-secondary line-through")}>
                <span className="w-24 shrink-0">{formatDate(new Date(p.paidAt))}</span>
                <span className="flex-1">
                  {METHOD[p.method]}
                  {p.receivedBy && <span className="text-text-secondary"> · {p.receivedBy}</span>}
                  {(p.cancelled || p.comment) && <span className="block text-xs text-text-secondary">{p.cancelled ? `Отменён: ${p.cancelled}` : p.comment}</span>}
                </span>
                <span className="font-medium tabular-nums">{formatRub(p.amount)}</span>
                {!p.cancelled && <CancelPaymentButton paymentId={p.id} amount={p.amount} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-surface">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Движение по балансу</h2>
        {finance.ledger.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">Записей нет.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {finance.ledger.map((e) => (
                <tr key={e.id} className="border-t first:border-t-0">
                  <td className="px-4 py-2 whitespace-nowrap text-text-secondary">
                    {formatDate(new Date(e.at))} {formatTime(new Date(e.at))}
                  </td>
                  <td className="px-2 py-2">
                    {e.reversal ? "Сторно" : LEDGER[e.type]}
                    {e.comment && <span className="block text-xs text-text-secondary">{e.comment}</span>}
                    <span className="block text-xs text-text-secondary">{e.author}</span>
                  </td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", e.amount > 0 ? "text-done" : "text-danger")}>
                    {e.amount > 0 ? "+" : ""}
                    {formatRub(e.amount)}
                  </td>
                  <td className="px-4 py-2 text-right text-text-secondary tabular-nums">{formatRub(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function ClientMessages({ messages }: { messages: ClientFinance["messages"] }) {
  const [pending, startTransition] = useTransition();
  if (!messages.length) return <p className="rounded-lg border bg-surface px-4 py-10 text-center text-sm text-text-secondary">Сообщений родителям пока не было.</p>;
  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className="rounded-lg border bg-surface p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium">{KIND[m.kind] ?? m.kind}</span>
            <span className="text-text-secondary">
              {formatDate(new Date(m.at))} {formatTime(new Date(m.at))}
            </span>
            <StatusBadge tone={MESSAGE_STATUS[m.status].tone}>{MESSAGE_STATUS[m.status].label}</StatusBadge>
            {m.error && <span className="text-xs text-warning">{m.error}</span>}
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(m.text);
                  toast.success("Текст скопирован");
                }}
              >
                <Copy /> Копировать
              </Button>
              {m.status !== "SENT" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await retryMessageAction(m.id);
                      if (r.ok) toast.success(r.message ?? "Отправлено");
                      else toast.error(r.error);
                    })
                  }
                >
                  <Send /> Отправить
                </Button>
              )}
            </div>
          </div>
          <pre className="font-sans whitespace-pre-wrap text-text-secondary">{m.text}</pre>
        </li>
      ))}
    </ul>
  );
}
