"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { localDateOf } from "@/domain/calendar";
import { formatDayMonth, formatTime, weekdayShort } from "@/domain/format";
import { PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { GroupRow } from "@/server/groups/queries";
import { EMPTY_GROUP, GroupSheet } from "./group-sheet";

export function GroupsView({
  groups,
  teachers,
  canManage,
  archived,
  createOpen,
}: {
  groups: GroupRow[];
  teachers: { id: string; fullName: string; subjects: string[] }[];
  canManage: boolean;
  archived: boolean;
  createOpen: boolean;
}) {
  const [open, setOpen] = useState(createOpen && canManage);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-surface p-0.5 text-sm">
          <Link href="/groups" className={cn("rounded-md px-3 py-1.5 text-text-secondary", !archived && "bg-brand-soft text-brand-text")}>
            Действующие
          </Link>
          <Link href="/groups?archived=1" className={cn("rounded-md px-3 py-1.5 text-text-secondary", archived && "bg-brand-soft text-brand-text")}>
            Архив
          </Link>
        </div>
        {canManage && (
          <Button className="ml-auto" onClick={() => setOpen(true)}>
            <Plus /> Группа
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={archived ? "В архиве групп нет" : "Групп пока нет"}
          hint={archived ? undefined : canManage ? "Создайте группу, затем добавьте в карточке учеников и расписание." : "Групп, которые вы ведёте, пока нет."}
          action={
            canManage && !archived ? (
              <Button onClick={() => setOpen(true)}>
                <Plus /> Создать группу
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Группа</th>
                <th className="px-4 py-2.5 font-medium">Педагог</th>
                <th className="px-4 py-2.5 font-medium">Расписание</th>
                <th className="px-4 py-2.5 font-medium">Учеников</th>
                <th className="px-4 py-2.5 font-medium">Ближайший урок</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const full = g.students >= g.maxStudents;
                return (
                  <tr key={g.id} className="border-t hover:bg-subtle/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/groups/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      <div className="text-xs text-text-secondary">
                        {g.subject} · {PROGRAM_LABEL[g.program]}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: g.teacher.color }} />
                        {g.teacher.fullName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {g.slots.length ? g.slots.map((s) => `${weekdayShort(s.weekday)} ${s.startTime}`).join(", ") : "не задано"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("tabular-nums", full && "font-medium text-warning")}>
                        {g.students} / {g.maxStudents}
                      </span>
                      <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
                        <div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-brand")} style={{ width: `${Math.min(100, (g.students / g.maxStudents) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary">
                      {g.nextLesson ? `${formatDayMonth(localDateOf(new Date(g.nextLesson)))}, ${formatTime(new Date(g.nextLesson))}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && <GroupSheet open={open} onOpenChange={setOpen} initial={EMPTY_GROUP} teachers={teachers} />}
    </div>
  );
}
