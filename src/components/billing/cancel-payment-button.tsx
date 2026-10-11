"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cancelPaymentAction } from "@/app/(app)/finance/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRub } from "@/domain/format";

/** Отмена ошибочного платежа: сторно в журнале, платёж остаётся в истории с причиной. */
export function CancelPaymentButton({ paymentId, amount }: { paymentId: string; amount: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" title="Отменить ошибочный платёж" aria-label="Отменить платёж" onClick={() => setOpen(true)}>
        <Undo2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Отменить платёж {formatRub(amount)}?</DialogTitle>
            <DialogDescription>Платёж останется в истории как отменённый, баланс клиента уменьшится.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`cancel-${paymentId}`}>Причина</Label>
            <Textarea id={`cancel-${paymentId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: ошиблись клиентом" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Назад
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !reason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await cancelPaymentAction(paymentId, reason);
                  if (r.ok) {
                    toast.success(r.message ?? "Платёж отменён");
                    setOpen(false);
                  } else toast.error(r.error);
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Отменить платёж
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
