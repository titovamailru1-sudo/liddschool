"use client";

import { addDays, localDateOf, parseLocalDate, type LocalDate } from "@/domain/calendar";
import { WEEKDAYS_SHORT } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { CalendarLesson } from "@/server/lessons/queries";
import { LessonBlock } from "./lesson-block";

const MAX_PER_DAY = 4;

export function MonthGrid({
  from,
  to,
  month,
  today,
  lessons,
  onLessonClick,
  onDayClick,
}: {
  from: LocalDate;
  to: LocalDate;
  month: number;
  today: LocalDate;
  lessons: CalendarLesson[];
  onLessonClick: (l: CalendarLesson) => void;
  onDayClick: (d: LocalDate) => void;
}) {
  const days: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, CalendarLesson[]>();
  for (const l of lessons) {
    const d = localDateOf(new Date(l.startsAt));
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="grid grid-cols-7 border-b bg-subtle text-xs font-medium text-text-secondary">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="px-2 py-1.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const items = byDay.get(d) ?? [];
          const { day, month: m } = parseLocalDate(d);
          const outside = m !== month;
          return (
            <div
              key={d}
              className={cn("min-h-28 border-b p-1", i % 7 !== 0 && "border-l", outside && "bg-subtle/50")}
            >
              <button
                type="button"
                onClick={() => onDayClick(d)}
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium hover:bg-subtle",
                  outside && "text-text-secondary",
                  d === today && "bg-brand text-white hover:bg-brand",
                )}
                aria-label={`Открыть день ${d}`}
              >
                {day}
              </button>
              <div className="space-y-0.5">
                {items.slice(0, MAX_PER_DAY).map((l) => (
                  <LessonBlock key={l.id} lesson={l} compact onClick={() => onLessonClick(l)} />
                ))}
                {items.length > MAX_PER_DAY && (
                  <button type="button" onClick={() => onDayClick(d)} className="px-1 text-xs text-brand-text hover:underline">
                    ещё {items.length - MAX_PER_DAY}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
