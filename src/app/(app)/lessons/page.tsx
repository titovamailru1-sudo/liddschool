import { CalendarDays, MapPin, Video } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { localDateOf, zonedInstant } from "@/domain/calendar";
import { formatLocalDate, formatTime } from "@/domain/format";
import { LESSON_STATUS, lessonDisplayStatus } from "@/lib/status";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Уроки" };

const WEEKDAY_LONG = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export default async function LessonsPage() {
  const user = await requirePermission("lessons.view");

  const at = now();
  const today = localDateOf(at);
  const from = zonedInstant(today, "00:00");
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000); // во Владивостоке нет перехода на летнее время

  // Педагог видит только свои уроки — фильтр на сервере, а не в интерфейсе.
  const lessons = await prisma.lesson.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      ...(user.role === "TEACHER" ? { teacherId: user.teacherId ?? "—" } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      teacher: { select: { fullName: true, color: true } },
      client: { select: { fullName: true } },
      group: { select: { name: true } },
      room: { select: { name: true } },
    },
  });

  const unmarked = lessons.filter(
    (l) => l.status === "PLANNED" && l.startsAt.getTime() + l.durationMin * 60_000 < at.getTime(),
  ).length;
  const weekday = WEEKDAY_LONG[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7];

  return (
    <>
      <PageHeader title="Уроки" description={`${weekday}, ${formatLocalDate(today)}`} />

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-surface px-4 py-3 text-sm">
        <span>
          Уроков сегодня: <b>{lessons.length}</b>
        </span>
        <span>
          Неотмеченных прошедших: <b className={unmarked ? "text-danger" : undefined}>{unmarked}</b>
        </span>
        <span className="text-text-secondary">Календарь (день, неделя, месяц) — этап 2</span>
      </div>

      {lessons.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="На сегодня уроков нет"
          hint={
            user.role === "TEACHER"
              ? "Когда администратор поставит вам урок, он появится здесь."
              : "Создайте урок или серию занятий через «+ Создать» — расписание появится на этапе 2."
          }
        />
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => {
            const status = LESSON_STATUS[lessonDisplayStatus(l.status)];
            return (
              <li
                key={l.id}
                className="flex items-center gap-4 rounded-lg border bg-surface px-4 py-3"
                style={{ borderLeft: `4px solid ${l.teacher.color}` }}
              >
                <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">{formatTime(l.startsAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.client?.fullName ?? `Группа ${l.group?.name}`}</div>
                  <div className="flex flex-wrap items-center gap-x-3 text-sm text-text-secondary">
                    <span>
                      {l.subject} · {l.durationMin} мин
                    </span>
                    {user.role !== "TEACHER" && <span>{l.teacher.fullName}</span>}
                    <span className="inline-flex items-center gap-1">
                      {l.format === "ONLINE" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
                      {l.format === "ONLINE" ? "Онлайн" : l.room?.name}
                    </span>
                  </div>
                </div>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
