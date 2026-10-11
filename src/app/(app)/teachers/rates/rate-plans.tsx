"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatLocalDate } from "@/domain/format";
import type { PlanView } from "@/server/payroll/rates";
import { savePlanAction, type PlanPayload } from "../actions";
import { PlanSummary } from "../[id]/teacher-tabs";

const NEW_PLAN: PlanPayload = {
  name: "",
  baseAmount: 700,
  groupPerStudent: 100,
  trialFixed: 500,
  payForUnexcused: false,
  bonusApply: "WHOLE_MONTH",
  tiers: [
    { thresholdHours: 30, bonusPercent: 10 },
    { thresholdHours: 45, bonusPercent: 15 },
  ],
};

export function RatePlans({ plans }: { plans: PlanView[] }) {
  const [editing, setEditing] = useState<{ id: string | null; values: PlanPayload } | null>(null);
  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing({ id: null, values: NEW_PLAN })}>
        <Plus /> Новый шаблон
      </Button>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <section key={p.id} className="space-y-3 rounded-lg border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{p.name}</h2>
              {p.isDefault && <StatusBadge tone="planned">Шаблон школы</StatusBadge>}
              {p.versionFrom && p.versionFrom > new Date().toISOString().slice(0, 10) && (
                <StatusBadge tone="moved">с {formatLocalDate(p.versionFrom)}</StatusBadge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setEditing({
                    id: p.id,
                    values: {
                      name: p.name,
                      baseAmount: p.baseAmount,
                      groupPerStudent: p.groupPerStudent,
                      trialFixed: p.trialFixed,
                      payForUnexcused: p.payForUnexcused,
                      bonusApply: p.bonusApply,
                      tiers: p.tiers,
                    },
                  })
                }
              >
                <Pencil /> Изменить
              </Button>
            </div>
            <PlanSummary p={p} />
            <p className="text-xs text-text-secondary">Педагогов с 1-го числа следующего месяца: {p.teachers}</p>
          </section>
        ))}
      </div>
      {editing && <PlanDialog planId={editing.id} initial={editing.values} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanDialog({ planId, initial, onClose }: { planId: string | null; initial: PlanPayload; onClose: () => void }) {
  const [v, setV] = useState<PlanPayload>(initial);
  const [pending, startTransition] = useTransition();
  const num = (k: "baseAmount" | "groupPerStudent" | "trialFixed") => ({
    value: String(v[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value.replace(/\D/g, "") || 0) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{planId ? "Изменить шаблон" : "Новый шаблон ставки"}</DialogTitle>
          <DialogDescription>
            {planId ? "Новые значения начнут действовать с 1-го числа следующего месяца для всех педагогов этого шаблона." : "Назначить шаблон педагогу — в его карточке."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await savePlanAction(planId, v);
              if (r.ok) {
                toast.success(r.message ?? "Сохранено");
                onClose();
              } else toast.error(r.error);
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Название</Label>
            <Input id="plan-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required placeholder="Ведущий педагог" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-base">₽ за урок-час</Label>
              <Input id="plan-base" inputMode="numeric" {...num("baseAmount")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-group">₽ за ученика в группе</Label>
              <Input id="plan-group" inputMode="numeric" {...num("groupPerStudent")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-trial">₽ за пробный</Label>
              <Input id="plan-trial" inputMode="numeric" {...num("trialFixed")} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-subtle/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Надбавка за объём часов в месяц</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={v.tiers.length >= 5}
                onClick={() => setV({ ...v, tiers: [...v.tiers, { thresholdHours: (v.tiers.at(-1)?.thresholdHours ?? 20) + 15, bonusPercent: 5 }] })}
              >
                <Plus /> Ступень
              </Button>
            </div>
            {v.tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                от
                <Input
                  aria-label={`Порог ступени ${i + 1}, часов`}
                  className="h-8 w-16"
                  inputMode="numeric"
                  value={String(t.thresholdHours)}
                  onChange={(e) => setV({ ...v, tiers: v.tiers.map((x, j) => (j === i ? { ...x, thresholdHours: Number(e.target.value.replace(/\D/g, "") || 0) } : x)) })}
                />
                ч → +
                <Input
                  aria-label={`Надбавка ступени ${i + 1}, %`}
                  className="h-8 w-16"
                  inputMode="numeric"
                  value={String(t.bonusPercent)}
                  onChange={(e) => setV({ ...v, tiers: v.tiers.map((x, j) => (j === i ? { ...x, bonusPercent: Number(e.target.value.replace(/\D/g, "") || 0) } : x)) })}
                />
                %
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить ступень" onClick={() => setV({ ...v, tiers: v.tiers.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {v.tiers.length > 0 && (
              <RadioGroup value={v.bonusApply} onValueChange={(x) => setV({ ...v, bonusApply: x as "WHOLE_MONTH" })} className="gap-1.5 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="WHOLE_MONTH" /> Процент ко всей сумме месяца
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="ABOVE_THRESHOLD" /> Только к часам сверх порога (прогрессивно)
                </label>
              </RadioGroup>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.payForUnexcused} onCheckedChange={(x) => setV({ ...v, payForUnexcused: x === true })} />
            Оплачивать педагогу неуважительный пропуск ученика
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
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
