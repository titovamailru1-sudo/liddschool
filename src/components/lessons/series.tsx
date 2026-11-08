"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { setSeriesEndAction } from "@/app/(app)/lessons/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, type LocalDate } from "@/domain/calendar";
import { formatLocalDate, weekdayShort } from "@/domain/format";

/** Регулярное занятие (серия) — у ученика или у группы. */
export interface Series {
  id: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  subject: string;
  teacher: { fullName: string; color: string };
  startsOn: LocalDate;
  endsOn: LocalDate | null;
}

export function seriesState(s: Series, today: LocalDate) {
  if (s.endsOn && s.endsOn < today) return { label: "Завершено", tone: "cancelled" as const };
  if (s.startsOn > today) return { label: "Начнётся", tone: "planned" as const };
  return { label: "Действует", tone: "done" as const };
}

export function SeriesRow({ s, today, canManage, onEdit }: { s: Series; today: LocalDate; canManage: boolean; onEdit: () => void }) {
  const state = seriesState(s, today);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <span className="w-24 font-semibold">
        {weekdayShort(s.weekday)} {s.startTime}
      </span>
      <span className="flex-1">
        {s.subject} · {s.durationMin} мин
        <span className="ml-2 inline-flex items-center gap-1.5 text-text-secondary">
          <span className="size-2 rounded-full" style={{ background: s.teacher.color }} />
          {s.teacher.fullName}
        </span>
      </span>
      <span className="text-text-secondary">
        с {formatLocalDate(s.startsOn)} {s.endsOn ? `по ${formatLocalDate(s.endsOn)}` : "· бессрочно"}
      </span>
      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      {canManage && (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <CalendarClock /> Срок
        </Button>
      )}
    </li>
  );
}

export function EndDialog({ series, today, onClose }: { series: Series; today: LocalDate; onClose: () => void }) {
  const [unlimited, setUnlimited] = useState(!series.endsOn);
  const [endsOn, setEndsOn] = useState(series.endsOn ?? addDays(today, 30));
  const [pending, startTransition] = useTransition();

  function save(value: string | null) {
    startTransition(async () => {
      const r = await setSeriesEndAction(series.id, value);
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onClose();
      } else toast.error(r.error ?? "Не удалось сохранить");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Срок действия: {weekdayShort(series.weekday)} {series.startTime}
          </DialogTitle>
          <DialogDescription>
            Запланированные уроки после даты окончания будут удалены. Проведённые и отменённые останутся в истории.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">Начало: {formatLocalDate(series.startsOn)}</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={unlimited} onCheckedChange={(v) => setUnlimited(v === true)} />
            Бессрочно
          </label>
          {!unlimited && (
            <div className="space-y-1.5">
              <Label htmlFor="ends-on">Действует по (включительно)</Label>
              <Input id="ends-on" type="date" min={series.startsOn} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => save(today < series.startsOn ? series.startsOn : today)}>
            Завершить сейчас
          </Button>
          <Button disabled={pending || (!unlimited && !endsOn)} onClick={() => save(unlimited ? null : endsOn)}>
            {pending && <Loader2Icon className="animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
