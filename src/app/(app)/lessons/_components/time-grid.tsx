"use client";

import { useEffect, useRef, useState } from "react";
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
// Рабочие часы сетки: с 9:00 до 23:00. Ночь не показываем.
const DEFAULT_FROM = 9;
const DEFAULT_TO = 23;

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
  // Текущее время: с сервера при загрузке, дальше обновляется каждые 30 секунд.
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);
  const today = localDateOf(new Date(now));
  const nowMin = minutesOf(now);
  const todayInView = columns.some((c) => c.date === today);

  // Сетка 9:00–23:00; расширяется только если урок поставлен раньше или позже.
  const all = columns.flatMap((c) => c.lessons);
  const fromHour = Math.min(DEFAULT_FROM, ...all.map((l) => Math.floor(minutesOf(l.startsAt) / 60)));
  const toHour = Math.max(DEFAULT_TO, ...all.map((l) => Math.ceil((minutesOf(l.startsAt) + l.durationMin) / 60)));
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const height = hours.length * HOUR_PX;
  // Линия текущего времени — только когда сейчас рабочие часы.
  const showNow = todayInView && nowMin >= fromHour * 60 && nowMin <= toHour * 60;
  const nowTop = ((nowMin - fromHour * 60) / 60) * HOUR_PX;

  // При открытии — прокрутить страницу к текущему часу (один раз).
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: "center" });
  }, []);

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
          {/* Красная линия текущего времени через весь календарь */}
          {showNow && (
            <div ref={nowRef} className="pointer-events-none absolute inset-x-0 z-[6]" style={{ top: nowTop }} aria-label={`Сейчас ${formatTime(new Date(now))}`}>
              <div className="absolute left-14 right-0 border-t border-danger/60" />
              <span className="absolute left-0 w-14 -translate-y-1/2 pr-1.5 text-right text-[11px] font-semibold text-danger tabular-nums">
                {formatTime(new Date(now))}
              </span>
              <span className="absolute left-14 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger" />
            </div>
          )}
          {/* Шкала времени */}
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="relative text-right text-[11px] text-text-secondary" style={{ height: HOUR_PX }}>
                {/* Первый час подписываем внутри строки, остальные — на линии сетки */}
                <span className={cn("absolute right-2 tabular-nums", h > fromHour ? "-top-2" : "top-0.5")}>{`${String(h).padStart(2, "0")}:00`}</span>
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
                {showNow && c.date === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-[6] -translate-y-px border-t-2 border-danger" style={{ top: nowTop }} />
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
