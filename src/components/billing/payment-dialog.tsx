"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { acceptPaymentAction } from "@/app/(app)/finance/actions";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const PAYMENT_METHODS = [
  { value: "SBP", label: "СБП" },
  { value: "TRANSFER", label: "Перевод" },
  { value: "CARD", label: "Карта" },
  { value: "CASH", label: "Наличные" },
  { value: "ONLINE", label: "Онлайн-касса" },
] as const;

export interface PaymentTarget {
  clientId: string;
  clientName: string;
  invoices?: { id: string; label: string; due: number }[];
  invoiceId?: string | null;
  lessonId?: string | null;
  lessonLabel?: string;
  amount?: number;
}

/**
 * «Принять оплату»: клиент, сумма, способ, назначение (счёт, урок или на баланс), дата, комментарий.
 * Без заданного клиента показывает выбор клиента.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  target,
  clients,
  today,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: PaymentTarget | null;
  clients?: { id: string; fullName: string }[];
  today: string;
  onDone?: (balance: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Принять оплату</DialogTitle>
          <DialogDescription>{target ? target.clientName : "Выберите клиента"}</DialogDescription>
        </DialogHeader>
        {open && <PaymentForm key={JSON.stringify(target)} target={target} clients={clients} today={today} onClose={() => onOpenChange(false)} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  target,
  clients,
  today,
  onClose,
  onDone,
}: {
  target: PaymentTarget | null;
  clients?: { id: string; fullName: string }[];
  today: string;
  onClose: () => void;
  onDone?: (balance: number) => void;
}) {
  const firstInvoice = target?.invoiceId ?? target?.invoices?.[0]?.id ?? null;
  const [clientId, setClientId] = useState<string | null>(target?.clientId ?? null);
  const [purpose, setPurpose] = useState<string>(target?.lessonId ? "lesson" : firstInvoice ? firstInvoice : "balance");
  const dueOf = (p: string) => target?.invoices?.find((i) => i.id === p)?.due;
  const [amount, setAmount] = useState(String(target?.amount ?? (firstInvoice ? (dueOf(firstInvoice) ?? "") : "")));
  const [method, setMethod] = useState<string>("SBP");
  const [paidAt, setPaidAt] = useState(today);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!clientId) return setError("Выберите клиента");
    setError(null);
    startTransition(async () => {
      const r = await acceptPaymentAction({
        clientId,
        amount: Number(amount.replace(/\s/g, "")),
        method: method as "SBP",
        invoiceId: purpose !== "balance" && purpose !== "lesson" ? purpose : null,
        lessonId: purpose === "lesson" ? (target?.lessonId ?? null) : null,
        paidAt,
        comment: comment || null,
      });
      if (r.ok) {
        toast.success(r.message ?? "Оплата принята");
        onClose();
        onDone?.(r.data?.balance ?? 0);
      } else setError(r.error);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!target && clients && (
        <div className="space-y-1.5">
          <Label>Клиент</Label>
          <SearchableSelect options={clients.map((c) => ({ value: c.id, label: c.fullName }))} value={clientId} onChange={setClientId} placeholder="Выберите клиента" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Сумма, ₽</Label>
          <Input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-method">Способ</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="pay-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-purpose">Назначение</Label>
        <Select
          value={purpose}
          onValueChange={(v) => {
            setPurpose(v);
            const due = dueOf(v);
            if (due) setAmount(String(due));
          }}
        >
          <SelectTrigger id="pay-purpose" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {target?.invoices?.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.label}
              </SelectItem>
            ))}
            {target?.lessonId && <SelectItem value="lesson">{target.lessonLabel ?? "Оплата урока"}</SelectItem>}
            <SelectItem value="balance">Пополнение баланса</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-date">Дата оплаты</Label>
        <Input id="pay-date" type="date" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-comment">Комментарий</Label>
        <Textarea id="pay-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
      </div>
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Принять
        </Button>
      </DialogFooter>
    </form>
  );
}
