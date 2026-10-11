"use client";

import { localDateOf } from "@/domain/calendar";
import { formatTime } from "@/domain/format";
import { layoutLanes } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";
import type { CalendarLesson } from "@/server/lessons/queries";
import { LessonBlock } from "./lesson-block";

export interface GridColumn {
  key: string;
  label: React.ReactNode;
  date: string; // LocalDate — день колонки
  teacherId?: string;
  highlight?: boolean;
  lessons: CalendarLesson[];
}

const HOUR_PX = 56;
const DEFAULT_FROM = 8;
const DEFAULT_TO = 22;

/** Минуты от полуночи по поясу школы. */
function minutesOf(iso: string) {
  const [h, m] = formatTime(new Date(iso)).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Сетка «время × колонки» для видов «День» (колонки — педагоги) и «Неделя» (колонки — дни).
 * Клик по пустому месту открывает создание урока с подставленными временем и колонкой.
 */
export function TimeGrid({
  columns,
  onLessonClick,
  onSlotClick,
  showTeacher,
  nowIso,
}: {
  columns: GridColumn[];
  onLessonClick: (lesson: CalendarLesson) => void;
  onSlotClick?: (column: GridColumn, time: string) => void;
  showTeacher?: boolean;
  nowIso: string;
}) {
  // Диапазон часов расширяется, если есть уроки раньше 8:00 или позже 22:00.
  const all = columns.flatMap((c) => c.lessons);
  const fromHour = Math.min(DEFAULT_FROM, ...all.map((l) => Math.floor(minutesOf(l.startsAt) / 60)));
  const toHour = Math.max(DEFAULT_TO, ...all.map((l) => Math.ceil((minutesOf(l.startsAt) + l.durationMin) / 60)));
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const height = hours.length * HOUR_PX;
  const today = localDateOf(new Date(nowIso));
  const nowMin = minutesOf(nowIso);

  return (
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <div className="min-w-fit" style={{ minWidth: 56 + columns.length * 120 }}>
        {/* Заголовки колонок */}
        <div className="flex border-b bg-surface">
          <div className="w-14 shrink-0" />
          {columns.map((c) => (
            <div
              key={c.key}
              className={cn("min-w-[120px] flex-1 border-l px-2 py-2 text-sm font-medium", c.highlight && "bg-brand-soft text-brand-text")}
            >
              {c.label}
            </div>
          ))}
        </div>

        <div className="relative flex" style={{ height }}>
          {/* Шкала времени */}
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="relative text-right text-[11px] text-text-secondary" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 tabular-nums">{h > fromHour ? `${String(h).padStart(2, "0")}:00` : ""}</span>
              </div>
            ))}
          </div>

          {columns.map((c) => {
            const laid = layoutLanes(
              c.lessons,
              (l) => minutesOf(l.startsAt),
              (l) => minutesOf(l.startsAt) + l.durationMin,
            );
            return (
              <div
                key={c.key}
                className={cn("relative min-w-[120px] flex-1 border-l", onSlotClick && "cursor-cell")}
                onClick={(e) => {
                  if (!onSlotClick) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minutes = fromHour * 60 + Math.floor(((e.clientY - rect.top) / HOUR_PX) * 4) * 15;
                  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
                  const mm = String(minutes % 60).padStart(2, "0");
                  onSlotClick(c, `${hh}:${mm}`);
                }}
              >
                {hours.map((h) => (
                  <div key={h} className="border-b border-dashed border-border/70" style={{ height: HOUR_PX }} />
                ))}
                {c.date === today && nowMin >= fromHour * 60 && nowMin <= toHour * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-danger" style={{ top: ((nowMin - fromHour * 60) / 60) * HOUR_PX }} />
                )}
                {laid.map(({ item, lane, lanes }) => {
                  const top = ((minutesOf(item.startsAt) - fromHour * 60) / 60) * HOUR_PX;
                  const h = Math.max((item.durationMin / 60) * HOUR_PX - 2, 22);
                  return (
                    <div
                      key={item.id}
                      className="absolute px-0.5"
                      style={{ top: top + 1, height: h, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                    >
                      <LessonBlock
                        lesson={item}
                        compact={item.durationMin < 60}
                        showTeacher={showTeacher}
                        className="h-full"
                        onClick={() => onLessonClick(item)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
