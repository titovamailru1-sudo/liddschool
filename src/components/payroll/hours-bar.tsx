import { formatHours } from "@/domain/format";
import { cn } from "@/lib/utils";

/**
 * Шкала часов за месяц с порогами надбавки: сплошная часть — проведено, светлая — прогноз по расписанию.
 */
export function HoursBar({
  hours,
  forecastHours,
  tiers,
  showPercents = true,
  className,
}: {
  hours: number;
  forecastHours?: number;
  tiers: readonly { thresholdHours: number; bonusPercent: number }[];
  showPercents?: boolean;
  className?: string;
}) {
  const maxTier = Math.max(0, ...tiers.map((t) => t.thresholdHours));
  const scale = Math.max(maxTier * 1.15, forecastHours ?? 0, hours, 10);
  const pct = (h: number) => `${Math.min(100, (h / scale) * 100)}%`;
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-2.5 rounded-full bg-subtle">
        {forecastHours !== undefined && forecastHours > hours && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand/20" style={{ width: pct(forecastHours) }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: pct(hours) }} />
        {tiers.map((t) => (
          <div
            key={t.thresholdHours}
            className={cn("absolute -top-1 h-[18px] w-0.5 rounded-full", hours >= t.thresholdHours ? "bg-done" : "bg-border-strong")}
            style={{ left: pct(t.thresholdHours) }}
            title={`${t.thresholdHours} ч${showPercents ? ` → +${t.bonusPercent}%` : ""}`}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-text-secondary">
        {tiers.map((t) => (
          <span key={t.thresholdHours} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t.thresholdHours) }}>
            {formatHours(t.thresholdHours)} ч{showPercents && ` · +${t.bonusPercent}%`}
          </span>
        ))}
      </div>
    </div>
  );
}
