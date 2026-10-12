"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CalendarX2, ChevronRight, TriangleAlert, Users } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { addDays, isoWeekday, localDateOf, type LocalDate } from "@/domain/calendar";
import { formatDayMonth, formatTime, weekdayShort } from "@/domain/format";
import { LESSON_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { CalendarLesson } from "@/server/lessons/queries";

const WEEKDAY_LONG = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

/** Свайп влево/вправо по экрану — следующий/предыдущий период. */
function useSwipe(onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

/** Полоса дней недели над списком (вид «День» на телефоне). */
export function DayStrip({ date, today, onPick }: { date: LocalDate; today: LocalDate; onPick: (d: LocalDate) => void }) {
  const monday = addDays(date, 1 - isoWeekday(date));
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Дни недели">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const active = d === date;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${WEEKDAY_LONG[i]}, ${formatDayMonth(d)}`}
            onClick={() => onPick(d)}
            className={cn(
              "flex flex-col items-center rounded-lg border bg-surface py-1.5 text-xs text-text-secondary",
              active && "border-brand bg-brand text-white",
              !active && d === today && "border-brand text-brand-text",
            )}
          >
            <span>{weekdayShort(i + 1)}</span>
            <span className="text-base font-semibold tabular-nums">{Number(d.slice(8))}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Мобильный список уроков по дням: крупные карточки, линия «сейчас» между уроками,
 * «Не отмечен» у прошедших неотмеченных. Свайп листает период.
 */
export function Agenda({
  lessons,
  days,
  nowIso,
  showTeacher,
  onLessonClick,
  onSwipe,
  empty,
}: {
  lessons: CalendarLesson[];
  days: LocalDate[]; // дни периода по порядку; пустые дни в «Неделе» показываем коротко
  nowIso: string;
  showTeacher: boolean;
  onLessonClick: (l: CalendarLesson) => void;
  onSwipe: (dir: 1 | -1) => void;
  empty: React.ReactNode;
}) {
  const [now, setNow] = useState(nowIso);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowMs = new Date(now).getTime();
  const today = localDateOf(new Date(now));
  const swipe = useSwipe(onSwipe);

  const byDay = new Map<LocalDate, CalendarLesson[]>();
  for (const l of lessons) {
    const d = localDateOf(new Date(l.startsAt));
    byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  const single = days.length === 1;
  // В месяце и списке пустые дни не показываем, в неделе — коротко.
  const shown = days.filter((d) => byDay.has(d) || days.length <= 7);

  return (
    <div className="min-h-[50vh] touch-pan-y space-y-4" {...swipe}>
      {lessons.length === 0 && shown.length <= 1 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed bg-surface px-6 py-12 text-center text-sm text-text-secondary">
          <CalendarX2 className="mb-3 size-8 text-text-secondary/60" />
          {empty}
          <span className="mt-1 text-xs">Листайте свайпом влево и вправо.</span>
        </div>
      ) : (
        shown.map((d) => {
          const list = byDay.get(d) ?? [];
          // Линия «сейчас» — перед первым уроком, который ещё не начался.
          const nowIndex = d === today ? list.findIndex((l) => new Date(l.startsAt).getTime() > nowMs) : -2;
          return (
            <section key={d} aria-label={`${WEEKDAY_LONG[isoWeekday(d) - 1]}, ${formatDayMonth(d)}`}>
              {!single && (
                <h3 className={cn("mb-1.5 text-sm font-semibold", d === today && "text-brand-text")}>
                  {WEEKDAY_LONG[isoWeekday(d) - 1]}, {formatDayMonth(d)}
                  {d === today && " · сегодня"}
                </h3>
              )}
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-text-secondary">Уроков нет</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((l, i) => (
                    <Fragment key={l.id}>
                      {i === nowIndex && <NowLine now={now} />}
                      <li>
                        <AgendaCard lesson={l} nowMs={nowMs} showTeacher={showTeacher} onClick={() => onLessonClick(l)} />
                      </li>
                    </Fragment>
                  ))}
                  {nowIndex === -1 && list.length > 0 && <NowLine now={now} />}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function NowLine({ now }: { now: string }) {
  const t = formatTime(new Date(now));
  return (
    <li className="flex items-center gap-2" aria-label={`Сейчас ${t}`}>
      <span className="text-[11px] font-semibold text-danger tabular-nums">{t}</span>
      <span className="size-2 rounded-full bg-danger" />
      <span className="h-0.5 flex-1 bg-danger" />
    </li>
  );
}

function AgendaCard({ lesson, nowMs, showTeacher, onClick }: { lesson: CalendarLesson; nowMs: number; showTeacher: boolean; onClick: () => void }) {
  const start = new Date(lesson.startsAt);
  const end = new Date(start.getTime() + lesson.durationMin * 60_000);
  const unmarked = lesson.status === "planned" && end.getTime() < nowMs;
  const live = lesson.status === "planned" && start.getTime() <= nowMs && nowMs <= end.getTime();
  const st = LESSON_STATUS[lesson.status];
  const inactive = lesson.status === "cancelled" || lesson.status === "moved" || lesson.status === "excused";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-l-4 bg-surface px-3 py-3 text-left active:bg-subtle",
        unmarked && "border-danger/40",
        live && "ring-2 ring-brand/40",
      )}
      style={{ borderLeftColor: lesson.teacherColor }}
    >
      <div className="w-12 shrink-0 text-sm leading-tight tabular-nums">
        <div className="font-semibold">{formatTime(start)}</div>
        <div className="text-xs text-text-secondary">{formatTime(end)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("flex items-center gap-1.5 font-medium", inactive && "text-text-secondary line-through")}>
          {lesson.isGroup && <Users className="size-3.5 shrink-0 text-text-secondary" />}
          <span className="truncate">{lesson.title}</span>
        </div>
        <div className="truncate text-xs text-text-secondary">
          {lesson.subject} · {lesson.durationMin} мин{showTeacher && ` · ${lesson.teacherName}`}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unmarked ? <StatusBadge tone="danger">Не отмечен</StatusBadge> : <StatusBadge tone={st.tone}>{live ? "Идёт сейчас" : st.label}</StatusBadge>}
          {lesson.atRisk && (
            <StatusBadge tone="warning">
              <TriangleAlert className="size-3" /> Не оплачен
            </StatusBadge>
          )}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-text-secondary" />
    </button>
  );
}
