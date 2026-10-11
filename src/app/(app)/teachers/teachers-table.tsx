"use client";

import Link from "next/link";
import { useState } from "react";
import { Percent, Plus } from "lucide-react";
import { HoursBar } from "@/components/payroll/hours-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatHours, formatRub } from "@/domain/format";
import type { TeacherRow } from "@/server/payroll/queries";
import { EMPTY_TEACHER, TeacherSheet } from "./teacher-sheet";

const LOGIN = {
  active: { label: "Входит в CRM", tone: "done" },
  invited: { label: "Приглашён", tone: "warning" },
  none: { label: "Без входа", tone: "cancelled" },
} as const;

export function TeachersTable({
  rows,
  showInactive,
  perms,
}: {
  rows: TeacherRow[];
  showInactive: boolean;
  perms: { create: boolean; rates: boolean };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={showInactive ? "/teachers" : "/teachers?all=1"}>{showInactive ? "Только работающие" : "Показать и ушедших"}</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          {perms.rates && (
            <Button variant="outline" asChild>
              <Link href="/teachers/rates">
                <Percent /> Шаблоны ставок
              </Link>
            </Button>
          )}
          {perms.create && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Педагог
            </Button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">ФИО</th>
                <th className="px-4 py-2.5 font-medium">Предметы</th>
                <th className="px-4 py-2.5 text-right font-medium">Учеников</th>
                <th className="px-4 py-2.5 text-right font-medium">Уроков</th>
                <th className="min-w-56 px-4 py-2.5 font-medium">Часы за месяц</th>
                {perms.rates && <th className="px-4 py-2.5 text-right font-medium">Начислено</th>}
                {perms.rates && <th className="px-4 py-2.5 text-right font-medium">Прогноз</th>}
                <th className="px-4 py-2.5 font-medium">Доступ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t hover:bg-subtle/60">
                  <td className="px-4 py-3">
                    <Link href={`/teachers/${t.id}`} className="inline-flex items-center gap-2 font-medium hover:text-brand-text hover:underline">
                      <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                      {t.fullName}
                    </Link>
                    {!t.isActive && <StatusBadge tone="cancelled" className="ml-2">не работает</StatusBadge>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{t.subjects.join(", ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.students}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.lessonsDone}
                    <span className="text-text-secondary"> из {t.lessonsTotal}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="mb-1 text-xs">
                      {formatHours(t.hours)} ч{t.hoursLeft !== null && <span className="text-text-secondary"> · до надбавки {formatHours(t.hoursLeft)} ч</span>}
                    </div>
                    <HoursBar hours={t.hours} forecastHours={t.forecastHours} tiers={t.tiers} showPercents={false} />
                  </td>
                  {perms.rates && <td className="px-4 py-3 text-right tabular-nums">{formatRub(t.money?.earned ?? 0)}</td>}
                  {perms.rates && <td className="px-4 py-3 text-right text-text-secondary tabular-nums">{formatRub(t.money?.forecast ?? 0)}</td>}
                  <td className="px-4 py-3">
                    <StatusBadge tone={LOGIN[t.login].tone}>{LOGIN[t.login].label}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {perms.create && <TeacherSheet open={open} onOpenChange={setOpen} initial={EMPTY_TEACHER} />}
    </div>
  );
}
