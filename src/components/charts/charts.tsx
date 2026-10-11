"use client";

import { useState } from "react";
import { formatRub } from "@/domain/format";
import { cn } from "@/lib/utils";

/**
 * Простые графики на SVG для отчётов. Правила оформления: тонкие отметки, линии 2px, столбцы ≤ 24px
 * со скруглённым концом, сетка — тонкая и спокойная, подписи — цветом текста (не цветом серии),
 * у двух и более серий всегда есть легенда, значения дублируются в таблице под графиком.
 * Палитра серий проверена валидатором (выручка — фиолетовый, поступления — зелёный).
 */
export const SERIES_COLORS = ["#7073E8", "#45B48C"] as const;

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} млн` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n);

export interface Point {
  label: string; // «окт»
  values: number[]; // по сериям
}

function Legend({ series, kind }: { series: string[]; kind: "line" | "bar" }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-text-secondary">
      {series.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          {kind === "line" ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[i] }} />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
          )}
          {s}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, title, rows }: { x: number; title: string; rows: { name: string; value: number; color: string }[] }) {
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border bg-surface px-3 py-2 text-xs shadow-md"
      style={{ left: `${(x / W) * 100}%`, transform: x > W / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
    >
      <div className="mb-1 font-medium text-text-secondary">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <b className="tabular-nums">{formatRub(r.value)}</b>
          <span className="text-text-secondary">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Линии по месяцам (несколько серий одной единицы — рубли), с перекрестием и подсказкой. */
export function LineChart({ points, series, ariaLabel }: { points: Point[]; series: string[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = points.flatMap((p) => p.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  const y = (v: number) => PAD.top + (1 - (v - ticks[0]) / (ticks.at(-1)! - ticks[0])) * (H - PAD.top - PAD.bottom);
  const x = (i: number) => PAD.left + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.left - PAD.right);

  return (
    <figure className="relative" aria-label={ariaLabel}>
      <Legend series={series} kind="line" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          points.forEach((_, i) => {
            if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border-default)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-secondary text-[11px]">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label + i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-secondary text-[11px]">
            {p.label}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border-strong)" strokeWidth={1} />}
        {series.map((s, si) => (
          <g key={s}>
            <polyline
              fill="none"
              stroke={SERIES_COLORS[si]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.values[si])}`).join(" ")}
            />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.values[si])}
                r={hover === i || i === points.length - 1 ? 4 : 0}
                fill={SERIES_COLORS[si]}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <Tooltip
          x={x(hover)}
          title={points[hover].label}
          rows={series.map((s, si) => ({ name: s, value: points[hover].values[si], color: SERIES_COLORS[si] }))}
        />
      )}
    </figure>
  );
}

/** Столбцы одной серии (например, прибыль по месяцам), отрицательные — вниз от нуля. */
export function ColumnChart({ points, name, ariaLabel }: { points: { label: string; value: number }[]; name: string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.min(0, ...points.map((p) => p.value)), Math.max(1, ...points.map((p) => p.value)));
  const y = (v: number) => PAD.top + (1 - (v - ticks[0]) / (ticks.at(-1)! - ticks[0])) * (H - PAD.top - PAD.bottom);
  const band = (W - PAD.left - PAD.right) / Math.max(1, points.length);
  const bw = Math.min(24, band * 0.5);
  const zero = y(0);
  const last = points.length - 1;

  return (
    <figure className="relative" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--border-default)"} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-secondary text-[11px]">
              {compact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const top = Math.min(y(p.value), zero);
          const h = Math.max(1, Math.abs(zero - y(p.value)));
          const r = Math.min(4, h / 2);
          const up = p.value >= 0;
          // Скруглён только конец столбца, у нуля — прямой угол.
          const d = up
            ? `M${cx - bw / 2},${zero} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${zero} Z`
            : `M${cx - bw / 2},${zero} V${zero + h - r} Q${cx - bw / 2},${zero + h} ${cx - bw / 2 + r},${zero + h} H${cx + bw / 2 - r} Q${cx + bw / 2},${zero + h} ${cx + bw / 2},${zero + h - r} V${zero} Z`;
          return (
            <g key={p.label + i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <rect x={cx - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} fill="transparent" />
              <path d={d} fill={SERIES_COLORS[0]} opacity={hover === null || hover === i ? 1 : 0.55} />
              {i === last && (
                // Подпись над нулевой линией у отрицательного столбца — чтобы не наезжать на подписи месяцев.
                <text x={cx} y={up ? top - 6 : zero - 6} textAnchor="middle" className="fill-text-primary text-[11px] font-medium">
                  {compact(p.value)}
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-text-secondary text-[11px]">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.left + band * hover + band / 2} title={points[hover].label} rows={[{ name, value: points[hover].value, color: SERIES_COLORS[0] }]} />
      )}
    </figure>
  );
}

/** Доли одной полосой (100%): посещаемость. Цвета статусов — как везде в CRM, с подписью и легендой. */
export function ShareBar({ parts }: { parts: { label: string; value: number; share: number; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={shown.map((p) => `${p.label} ${p.share}%`).join(", ")}>
        {shown.map((p, i) => (
          <div
            key={p.label}
            className={cn("h-full transition-opacity", hover !== null && hover !== i && "opacity-60")}
            style={{ width: `${p.share}%`, background: p.color }}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            title={`${p.label}: ${p.value} (${p.share}%)`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-text-secondary">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: <b className="text-text-primary tabular-nums">{p.share}%</b> ({p.value})
          </span>
        ))}
      </div>
    </div>
  );
}
