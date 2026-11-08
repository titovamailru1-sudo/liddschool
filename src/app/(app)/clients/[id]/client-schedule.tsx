"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Users } from "lucide-react";
import { CreateLessonSheet } from "@/components/lessons/create-lesson-sheet";
import { EndDialog, SeriesRow } from "@/components/lessons/series";
import { Button } from "@/components/ui/button";
import type { LocalDate } from "@/domain/calendar";
import { weekdayShort } from "@/domain/format";
import type { ClientCard } from "@/server/clients/queries";
import type { LessonFormOptions } from "@/server/lessons/queries";

type Series = ClientCard["series"][number];

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
              <Link href={`/groups/${g.id}`} className="font-medium hover:underline">
                Группа {g.name}
              </Link>
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
