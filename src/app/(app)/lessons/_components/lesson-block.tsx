import { Ban, Check, MoveRight, TriangleAlert, Users, X } from "lucide-react";
import { formatTime } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { CalendarLesson } from "@/server/lessons/queries";

const STATUS_ICON = {
  planned: null,
  done: Check,
  cancelled: Ban,
  excused: X,
  unexcused: X,
  moved: MoveRight,
} as const;

const STATUS_ICON_COLOR = {
  planned: "",
  done: "text-done",
  cancelled: "text-cancelled",
  excused: "text-warning",
  unexcused: "text-danger",
  moved: "text-moved",
} as const;

/** Карточка урока в сетке: время, ученик/группа, предмет, цвет педагога, иконка статуса. */
export function LessonBlock({
  lesson,
  compact = false,
  showTeacher = false,
  className,
  style,
  onClick,
}: {
  lesson: CalendarLesson;
  compact?: boolean;
  showTeacher?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick: () => void;
}) {
  const start = new Date(lesson.startsAt);
  const end = new Date(start.getTime() + lesson.durationMin * 60_000);
  const Icon = STATUS_ICON[lesson.status];
  const inactive = lesson.status === "cancelled" || lesson.status === "moved" || lesson.status === "excused";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${formatTime(start)}–${formatTime(end)} ${lesson.title} · ${lesson.subject} · ${lesson.teacherName}${lesson.atRisk ? " · под угрозой: не оплачен" : ""}`}
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-xs leading-tight transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        inactive && "opacity-60",
        lesson.atRisk && "ring-2 ring-warning ring-inset",
        className,
      )}
      style={{ borderLeftColor: lesson.teacherColor, background: `color-mix(in srgb, ${lesson.teacherColor} 14%, white)`, ...style }}
    >
      <span className="flex items-center gap-1 font-medium text-text-secondary tabular-nums">
        {formatTime(start)}
        {!compact && `–${formatTime(end)}`}
        {lesson.isGroup && <Users className="size-3" />}
        {lesson.atRisk && <TriangleAlert className="size-3.5 text-warning" aria-label="Под угрозой: не оплачен" />}
        {Icon && <Icon className={cn("ml-auto size-3.5 shrink-0", STATUS_ICON_COLOR[lesson.status])} strokeWidth={2.5} />}
      </span>
      <span className={cn("truncate font-semibold text-text-primary", inactive && "line-through")}>{lesson.title}</span>
      {!compact && (
        <span className="truncate text-text-secondary">
          {lesson.subject}
          {showTeacher && ` · ${lesson.teacherName}`}
        </span>
      )}
    </button>
  );
}
