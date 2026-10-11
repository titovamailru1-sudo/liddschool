"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, CalendarPlus, Loader2Icon, Users } from "lucide-react";
import { toast } from "sonner";
import { setSeriesEndAction } from "@/app/(app)/lessons/actions";
import { CreateLessonSheet } from "@/components/lessons/create-lesson-sheet";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, type LocalDate } from "@/domain/calendar";
import { formatLocalDate, weekdayShort } from "@/domain/format";
import type { ClientCard } from "@/server/clients/queries";
import type { LessonFormOptions } from "@/server/lessons/queries";

type Series = ClientCard["series"][number];

function seriesState(s: Series, today: LocalDate) {
  if (s.endsOn && s.endsOn < today) return { label: "Завершено", tone: "cancelled" as const };
  if (s.startsOn > today) return { label: "Начнётся", tone: "planned" as const };
  return { label: "Действует", tone: "done" as const };
}

/** Регулярное расписание ученика со сроком действия: «с … по …» или бессрочно. */
export function ClientSchedule({
  clientId,
  series,
  groups,
  canManage,
  options,
  today,
}: {
  clientId: string;
  series: Series[];
  groups: ClientCard["groups"];
  canManage: boolean;
  options: LessonFormOptions | null;
  today: LocalDate;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Series | null>(null);
  const active = series.filter((s) => !s.endsOn || s.endsOn >= today);
  const finished = series.filter((s) => s.endsOn && s.endsOn < today);

  return (
    <section className="rounded-lg border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Расписание</h2>
          <p className="text-xs text-text-secondary">Регулярные занятия и срок их действия. Уроки создаются автоматически.</p>
        </div>
        {canManage && options && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <CalendarPlus /> Добавить
          </Button>
        )}
      </div>

      {active.length === 0 && groups.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-text-secondary">
          Регулярных занятий нет.
          {canManage && " Нажмите «Добавить», чтобы задать дни, время и срок действия."}
        </div>
      ) : (
        <ul className="divide-y">
          {active.map((s) => (
            <SeriesRow key={s.id} s={s} today={today} canManage={canManage} onEdit={() => setEditing(s)} />
          ))}
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Users className="size-4 text-text-secondary" />
              <span className="font-medium">Группа {g.name}</span>
              <span className="text-text-secondary">
                {g.slots.map((x) => `${weekdayShort(x.weekday)} ${x.startTime}, ${x.durationMin} мин`).join("; ") || "без расписания"}
                {" · "}
                {g.teacher}
              </span>
            </li>
          ))}
        </ul>
      )}

      {finished.length > 0 && (
        <details className="border-t px-4 py-2 text-sm">
          <summary className="cursor-pointer py-1 text-text-secondary">Завершённые ({finished.length})</summary>
          <ul className="divide-y">
            {finished.map((s) => (
              <SeriesRow key={s.id} s={s} today={today} canManage={canManage} onEdit={() => setEditing(s)} />
            ))}
          </ul>
        </details>
      )}

      {canManage && options && (
        <CreateLessonSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          options={options}
          defaults={{ date: today, clientId, weekly: true }}
          onCreated={() => router.refresh()}
        />
      )}
      {editing && <EndDialog series={editing} today={today} onClose={() => setEditing(null)} />}
    </section>
  );
}

function SeriesRow({ s, today, canManage, onEdit }: { s: Series; today: LocalDate; canManage: boolean; onEdit: () => void }) {
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

function EndDialog({ series, today, onClose }: { series: Series; today: LocalDate; onClose: () => void }) {
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
