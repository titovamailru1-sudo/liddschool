import { TriangleAlert } from "lucide-react";
import { localDateOf } from "@/domain/calendar";
import { formatDayMonth, formatTime } from "@/domain/format";
import type { ConflictView } from "@/server/lessons/service";
import { cn } from "@/lib/utils";

/** Список пересечений: педагог занят — красным (сохранить нельзя), ученик занят — жёлтым (можно подтвердить). */
export function ConflictList({ conflicts, max = 5 }: { conflicts: readonly ConflictView[]; max?: number }) {
  if (!conflicts.length) return null;
  const blocking = conflicts.some((c) => c.kind === "teacher");
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        blocking ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-4" />
        {blocking ? "Педагог в это время занят" : "Ученик в это время на другом уроке"}
      </div>
      <ul className="space-y-0.5 text-text-primary">
        {conflicts.slice(0, max).map((c, i) => {
          const at = new Date(c.otherStartsAt);
          return (
            <li key={i}>
              {formatDayMonth(localDateOf(at))} {formatTime(at)} — {c.otherTitle}
              <span className="text-text-secondary"> · {c.teacherName}</span>
              {c.kind === "client" && blocking && <span className="text-text-secondary"> (ученик)</span>}
            </li>
          );
        })}
        {conflicts.length > max && <li className="text-text-secondary">и ещё {conflicts.length - max}</li>}
      </ul>
    </div>
  );
}
