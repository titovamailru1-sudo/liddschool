import { cn } from "@/lib/utils";

export type StatusTone = "planned" | "done" | "warning" | "danger" | "moved" | "cancelled";

const TONE_CLASS: Record<StatusTone, string> = {
  planned: "bg-planned-soft text-planned",
  done: "bg-done-soft text-done",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  moved: "bg-moved-soft text-moved",
  cancelled: "bg-cancelled-soft text-cancelled",
};

/** Единый бейдж статуса — цвета одинаковые во всей системе (CLAUDE.md → «Дизайн»). */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
