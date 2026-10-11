"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { localDateOf } from "@/domain/calendar";
import { formatLocalDate, formatTime, weekdayShort } from "@/domain/format";
import { isoWeekday } from "@/domain/calendar";
import { LESSON_STATUS } from "@/lib/status";
import type { CalendarLesson } from "@/server/lessons/queries";

const PAGE = 50;

export function LessonList({
  lessons,
  showTeacher,
  onLessonClick,
}: {
  lessons: CalendarLesson[];
  showTeacher: boolean;
  onLessonClick: (l: CalendarLesson) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(lessons.length / PAGE));
  const rows = lessons.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-medium">Дата</th>
              <th className="px-4 py-2.5 font-medium">Время</th>
              <th className="px-4 py-2.5 font-medium">Ученик / группа</th>
              <th className="px-4 py-2.5 font-medium">Предмет</th>
              {showTeacher && <th className="px-4 py-2.5 font-medium">Педагог</th>}
              <th className="px-4 py-2.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const start = new Date(l.startsAt);
              const d = localDateOf(start);
              const st = LESSON_STATUS[l.status];
              return (
                <tr key={l.id} className="cursor-pointer border-t hover:bg-subtle/60" onClick={() => onLessonClick(l)}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatLocalDate(d)} <span className="text-text-secondary">{weekdayShort(isoWeekday(d))}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {formatTime(start)} <span className="text-text-secondary">· {l.durationMin} мин</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {l.isGroup && <Users className="size-3.5 text-text-secondary" />}
                      {l.title}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{l.subject}</td>
                  {showTeacher && (
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: l.teacherColor }} />
                        {l.teacherName}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-text-secondary">
          <span>
            {page * PAGE + 1}–{Math.min(lessons.length, (page + 1) * PAGE)} из {lessons.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Назад
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              Вперёд
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
