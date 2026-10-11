"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runJobsAction, savePayeeAction } from "./actions";

type Payee = { name?: string; payeeInn?: string; bankName?: string; bic?: string; personalAcc?: string; correspAcc?: string; sbpPhone?: string };

const FIELDS: { key: keyof Payee; label: string; placeholder: string; numeric?: boolean }[] = [
  { key: "name", label: "Получатель", placeholder: "ИП Иванова Анна Андреевна" },
  { key: "payeeInn", label: "ИНН", placeholder: "10 или 12 цифр", numeric: true },
  { key: "bankName", label: "Банк", placeholder: "ПАО Сбербанк" },
  { key: "bic", label: "БИК", placeholder: "9 цифр", numeric: true },
  { key: "personalAcc", label: "Расчётный счёт", placeholder: "20 цифр", numeric: true },
  { key: "correspAcc", label: "Корр. счёт", placeholder: "20 цифр", numeric: true },
  { key: "sbpPhone", label: "Телефон для СБП (необязательно)", placeholder: "+7 914 000-00-00" },
];

export function PayeeForm({ initial }: { initial: Payee }) {
  const [v, setV] = useState<Payee>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await savePayeeAction({
            name: v.name ?? "",
            payeeInn: v.payeeInn || undefined,
            bankName: v.bankName ?? "",
            bic: v.bic ?? "",
            personalAcc: v.personalAcc ?? "",
            correspAcc: v.correspAcc ?? "",
            sbpPhone: v.sbpPhone || undefined,
          });
          if (r.ok) toast.success(r.message ?? "Сохранено");
          else setError(r.error);
        });
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`payee-${f.key}`}>{f.label}</Label>
          <Input
            id={`payee-${f.key}`}
            inputMode={f.numeric ? "numeric" : undefined}
            placeholder={f.placeholder}
            value={v[f.key] ?? ""}
            onChange={(e) => setV({ ...v, [f.key]: f.numeric ? e.target.value.replace(/\D/g, "") : e.target.value })}
          />
        </div>
      ))}
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Сохранить реквизиты
      </Button>
    </form>
  );
}

export function RunJobsButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await runJobsAction();
          if (r.ok) toast.success(`${r.message}: ${JSON.stringify(r.data)}`);
          else toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <Play />} Запустить сейчас
    </Button>
  );
}
