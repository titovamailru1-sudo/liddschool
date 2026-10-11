import type { LucideIcon } from "lucide-react";

/** Пустое состояние экрана с подсказкой первого действия. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-text">
        <Icon className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 max-w-sm text-sm text-text-secondary">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
