"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Lock, Minus, Plus, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  cancelPayrollPaymentAction,
  closePayrollMonthAction,
  payrollAdjustmentAction,
  payrollPaymentAction,
} from "@/app/(app)/finance/payroll-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { parseLocalDate } from "@/domain/calendar";
import { formatDate, formatHours, formatRub, formatTime } from "@/domain/format";
import { LESSON_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { TeacherMonth } from "@/server/payroll/payroll";
import { HoursBar } from "./hours-bar";

export const PAYROLL_STATUS = {
  OPEN: { label: "Месяц идёт", tone: "planned" },
  CLOSED: { label: "Закрыт, к выплате", tone: "warning" },
  PAID: { label: "Выплачено", tone: "done" },
} as const;

/** Подсказка до следующей ступени надбавки. */
export function tierHint(p: TeacherMonth["progress"]) {
  if (!p.next) return p.currentPercent ? `Максимальная надбавка +${p.currentPercent}%` : "Надбавка не предусмотрена";
  return `До +${p.next.bonusPercent}% осталось ${formatHours(p.next.hoursLeft)} ч`;
}

/** Ведомость педагога за месяц: итоги, шкала, уроки, премии/штрафы, выплаты; владельцу — действия. */
export function PayrollDetail({ view, canManage, today }: { view: TeacherMonth; canManage: boolean; today: string }) {
  const { year, month } = parseLocalDate(view.month);
  const target = { teacherId: view.teacher.id, year, month };
  const [dialog, setDialog] = useState<null | "bonus" | "fine" | "advance" | "payout" | "close">(null);
  const status = PAYROLL_STATUS[view.status];
  const earned = view.snapshot ? view.snapshot.baseAmount + view.snapshot.bonusAmount : view.actual.total;
  const bonusPercent = view.snapshot ? view.snapshot.bonusPercent : view.actual.bonusPercent;
  const bonusAmount = view.snapshot ? view.snapshot.bonusAmount : view.actual.bonusAmount;
  const hours = view.snapshot ? view.snapshot.hours : view.actual.hours;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi label={view.ended ? "Начислено" : "Начислено на сегодня"} value={formatRub(earned)} hint={`${formatHours(hours)} ч · уроков ${view.lessons.length}`} />
        <Kpi label="Надбавка за объём" value={bonusPercent ? `+${bonusPercent}% · ${formatRub(bonusAmount)}` : "нет"} hint={tierHint(view.progress)} />
        <Kpi
          label="Премии, штрафы, перерасчёт"
          value={formatRub(view.totals.adjustments)}
          hint={`Итого к начислению ${formatRub(view.totals.total)}`}
        />
        <Kpi
          label="К выплате"
          value={formatRub(view.totals.toPay)}
          hint={`Выплачено ${formatRub(view.totals.paid)}`}
          accent={view.status === "OPEN" ? undefined : view.totals.toPay > 0 ? "danger" : "done"}
        />
      </div>

      <div className="rounded-lg border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            Часы за месяц: {formatHours(view.actual.hours)}
            {!view.ended && view.plannedCount > 0 && <span className="text-text-secondary"> · по расписанию до {formatHours(view.forecast.hours)}</span>}
          </span>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <HoursBar hours={view.actual.hours} forecastHours={view.ended ? undefined : view.forecast.hours} tiers={view.plan.tiers} />
        {!view.ended && view.plannedCount > 0 && (
          <p className="mt-2 text-sm text-text-secondary">
            Прогноз на месяц, если все {view.plannedCount} запланированных уроков состоятся: <b className="text-text-primary">{formatRub(view.forecast.total)}</b>
            {view.forecast.bonusPercent > view.actual.bonusPercent && ` (с надбавкой +${view.forecast.bonusPercent}%)`}.
          </p>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {view.status === "OPEN" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog("bonus")}>
                <Plus /> Премия
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog("fine")}>
                <Minus /> Штраф
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog("advance")}>
                <Wallet /> Аванс
              </Button>
            </>
          )}
          {view.status !== "OPEN" && view.totals.toPay > 0 && (
            <Button size="sm" onClick={() => setDialog("payout")}>
              <Wallet /> Отметить выплату {formatRub(view.totals.toPay)}
            </Button>
          )}
          {view.status === "OPEN" && view.ended && (
            <Button size="sm" onClick={() => setDialog("close")}>
              <Lock /> Закрыть месяц
            </Button>
          )}
        </div>
      )}

      {(view.adjustments.length > 0 || view.payments.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.adjustments.length > 0 && (
            <section className="rounded-lg border bg-surface">
              <h3 className="border-b px-4 py-2.5 text-sm font-semibold">Премии, штрафы, перерасчёт</h3>
              <ul className="divide-y text-sm">
                {view.adjustments.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2">
                    <span className="flex-1">
                      {a.reason}
                      <span className="block text-xs text-text-secondary">
                        {formatDate(new Date(a.at))} · {a.author}
                      </span>
                    </span>
                    <span className={cn("tabular-nums", a.amount > 0 ? "text-done" : "text-danger")}>
                      {a.amount > 0 ? "+" : ""}
                      {formatRub(a.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view.payments.length > 0 && (
            <section className="rounded-lg border bg-surface">
              <h3 className="border-b px-4 py-2.5 text-sm font-semibold">Авансы и выплаты</h3>
              <ul className="divide-y text-sm">
                {view.payments.map((p) => (
                  <li key={p.id} className={cn("flex items-center gap-3 px-4 py-2", p.cancelled && "text-text-secondary line-through")}>
                    <span className="flex-1">
                      {p.isAdvance ? "Аванс" : "Выплата"} · {formatDate(new Date(p.paidAt))}
                      {(p.cancelled || p.comment) && <span className="block text-xs text-text-secondary">{p.cancelled ? `Отменена: ${p.cancelled}` : p.comment}</span>}
                    </span>
                    <span className="tabular-nums">{formatRub(p.amount)}</span>
                    {canManage && !p.cancelled && <CancelPayout paymentId={p.id} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border bg-surface">
        <h3 className="border-b px-4 py-2.5 text-sm font-semibold">Проведённые уроки</h3>
        {view.lessons.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">В этом месяце пока нет отмеченных уроков.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {view.lessons.map((l) => {
                  const d = new Date(l.startsAt);
                  const st = LESSON_STATUS[l.status];
                  return (
                    <tr key={l.id} className="border-t first:border-t-0">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatDate(d)}
                        <span className="block text-xs text-text-secondary sm:inline sm:text-sm sm:text-text-primary"> {formatTime(d)}</span>
                      </td>
                      <td className="px-2 py-2">
                        {l.title}
                        <span className="block text-xs text-text-secondary">
                          {l.subject} · {l.durationMin} мин
                        </span>
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </td>
                      <td className="hidden px-2 py-2 text-xs text-text-secondary md:table-cell">{l.basis}</td>
                      <td className="px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums">{formatRub(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && dialog && (
        <PayrollDialog kind={dialog} target={target} today={today} toPay={view.totals.toPay} teacherName={view.teacher.fullName} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "danger" | "done" }) {
  return (
    <div className="rounded-lg border bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums sm:text-lg", accent === "danger" && "text-danger", accent === "done" && "text-done")}>{value}</div>
      {hint && <div className="text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}

function CancelPayout({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Отменить выплату" title="Отменить ошибочную выплату" onClick={() => setOpen(true)}>
        <Undo2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Отменить выплату?</DialogTitle>
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
                  const r = await cancelPayrollPaymentAction(paymentId, reason);
                  if (r.ok) {
                    toast.success(r.message ?? "Отменено");
                    setOpen(false);
                  } else toast.error(r.error);
                })
              }
            >
              Отменить выплату
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const TITLES = {
  bonus: "Премия",
  fine: "Штраф",
  advance: "Аванс",
  payout: "Выплата",
  close: "Закрыть месяц",
} as const;

function PayrollDialog({
  kind,
  target,
  today,
  toPay,
  teacherName,
  onClose,
}: {
  kind: keyof typeof TITLES;
  target: { teacherId: string; year: number; month: number };
  today: string;
  toPay: number;
  teacherName: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(kind === "payout" ? String(Math.max(0, toPay)) : "");
  const [text, setText] = useState("");
  const [date, setDate] = useState(today);
  const [advanceKind, setAdvanceKind] = useState<"advance" | "payout">(kind === "payout" ? "payout" : "advance");
  const [pending, startTransition] = useTransition();
  const n = Number(amount.replace(/\s/g, ""));

  function submit() {
    startTransition(async () => {
      const r =
        kind === "close"
          ? await closePayrollMonthAction([target.teacherId], target.year, target.month)
          : kind === "bonus" || kind === "fine"
            ? await payrollAdjustmentAction(target, kind === "fine" ? -n : n, text)
            : await payrollPaymentAction(target, { amount: n, paidAt: date, isAdvance: advanceKind === "advance", comment: text || null });
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
          <DialogDescription>
            {teacherName}
            {kind === "close" && " — сумма месяца будет зафиксирована. Исправления отметок после закрытия попадут в перерасчёт текущего месяца."}
          </DialogDescription>
        </DialogHeader>
        {kind !== "close" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {(kind === "advance" || kind === "payout") && (
              <RadioGroup value={advanceKind} onValueChange={(v) => setAdvanceKind(v as typeof advanceKind)} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="advance" /> Аванс
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="payout" /> Выплата
                </label>
              </RadioGroup>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pr-amount">Сумма, ₽</Label>
              <Input id="pr-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} required autoFocus />
            </div>
            {(kind === "advance" || kind === "payout") && (
              <div className="space-y-1.5">
                <Label htmlFor="pr-date">Дата</Label>
                <Input id="pr-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pr-text">{kind === "bonus" || kind === "fine" ? "Причина" : "Комментарий"}</Label>
              <Textarea id="pr-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} required={kind === "bonus" || kind === "fine"} />
            </div>
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={pending || (kind !== "close" && !(n > 0)) || ((kind === "bonus" || kind === "fine") && !text.trim())} onClick={submit}>
            {pending && <Loader2Icon className="animate-spin" />}
            {kind === "close" ? "Закрыть месяц" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


