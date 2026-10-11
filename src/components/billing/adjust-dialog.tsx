"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { adjustBalanceAction } from "@/app/(app)/finance/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/** Возврат денег или ручная корректировка баланса — всегда с комментарием, попадает в журнал с автором. */
export function AdjustDialog({ open, onOpenChange, clientId }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: string }) {
  const [kind, setKind] = useState<"REFUND" | "ADJUSTMENT">("REFUND");
  const [sign, setSign] = useState<"+" | "-">("+");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const n = Number(amount.replace(/\s/g, ""));
    setError(null);
    startTransition(async () => {
      const r = await adjustBalanceAction({ clientId, kind, amount: kind === "ADJUSTMENT" && sign === "-" ? -n : n, comment });
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onOpenChange(false);
        setAmount("");
        setComment("");
      } else setError(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Возврат или корректировка</DialogTitle>
          <DialogDescription>Запись нельзя удалить — только исправить новой записью. Комментарий обязателен.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="gap-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="REFUND" /> Возврат денег клиенту (баланс уменьшится)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="ADJUSTMENT" /> Корректировка баланса
            </label>
          </RadioGroup>
          <div className="flex items-end gap-2">
            {kind === "ADJUSTMENT" && (
              <div className="flex rounded-md border p-0.5" role="group" aria-label="Знак корректировки">
                {(["+", "-"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={sign === s}
                    onClick={() => setSign(s)}
                    className={sign === s ? "h-8 w-9 rounded-sm bg-brand-soft font-semibold text-brand-text" : "h-8 w-9 text-text-secondary"}
                  >
                    {s === "+" ? "+" : "−"}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="adj-amount">Сумма, ₽</Label>
              <Input id="adj-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-comment">Комментарий</Label>
            <Textarea id="adj-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} required placeholder="Почему меняется баланс" />
          </div>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
