"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2Icon, Pencil, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { CreateLessonSheet } from "@/components/lessons/create-lesson-sheet";
import { EndDialog, SeriesRow, type Series } from "@/components/lessons/series";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoWeekday, localDateOf, type LocalDate } from "@/domain/calendar";
import type { JournalCell } from "@/domain/groups";
import { formatDayMonth, formatLocalDate, formatTime, monthName, weekdayShort } from "@/domain/format";
import { PAYMENT_MODE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { GroupCard } from "@/server/groups/queries";
import type { LessonFormOptions } from "@/server/lessons/queries";
import { addMemberAction, removeMemberAction } from "../actions";
import { GroupSheet } from "../group-sheet";

type Month = { year: number; month: number; key: string; prev: string; next: string };

export function GroupCardView({
  card,
  month,
  today,
  canManage,
  options,
  clients,
  teachers,
}: {
  card: GroupCard;
  month: Month;
  today: LocalDate;
  canManage: boolean;
  options: LessonFormOptions | null;
  clients: { id: string; fullName: string; program: "EXAM" | "SCHOOL" }[];
  teachers: { id: string; fullName: string; subjects: string[] }[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const [remove, setRemove] = useState<{ id: string; fullName: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [ending, setEnding] = useState<Series | null>(null);
  const active = card.series.filter((s) => !s.endsOn || s.endsOn >= today);
  const finished = card.series.filter((s) => s.endsOn && s.endsOn < today);
  const full = card.members.length >= card.maxStudents;
  const memberIds = new Set(card.members.map((m) => m.id));

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil /> Изменить группу
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Состав */}
        <section className="rounded-lg border bg-surface" aria-labelledby="members-h">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 id="members-h" className="text-sm font-semibold">
                Состав · {card.members.length} из {card.maxStudents}
              </h2>
              <p className="text-xs text-text-secondary">Ученик платит за уроки группы с даты вступления по групповому тарифу.</p>
            </div>
            {canManage && card.isActive && (
              <Button size="sm" onClick={() => setAdd(true)} disabled={full} title={full ? "Группа заполнена — увеличьте максимум" : undefined}>
                <UserPlus /> Ученик
              </Button>
            )}
          </div>
          {card.members.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-secondary">
              В группе пока нет учеников.{canManage && " Нажмите «Ученик», чтобы добавить."}
            </p>
          ) : (
            <ul className="divide-y">
              {card.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Link href={`/clients/${m.id}`} className="flex-1 font-medium hover:underline">
                    {m.fullName}
                  </Link>
                  <span className="text-xs text-text-secondary">
                    {PAYMENT_MODE_LABEL[m.paymentMode].toLowerCase()} · с {formatLocalDate(m.joinedAt)}
                    {m.leftAt && ` по ${formatLocalDate(m.leftAt)}`}
                  </span>
                  {canManage && !m.leftAt && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Вывести из группы: ${m.fullName}`} onClick={() => setRemove(m)}>
                      <UserMinus />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {card.former.length > 0 && (
            <details className="border-t px-4 py-2 text-sm">
              <summary className="cursor-pointer py-1 text-text-secondary">Выбывшие ({card.former.length})</summary>
              <ul className="space-y-1 pb-2">
                {card.former.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 text-text-secondary">
                    <Link href={`/clients/${m.id}`} className="hover:underline">
                      {m.fullName}
                    </Link>
                    <span>с {formatLocalDate(m.leftAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Расписание */}
        <section className="rounded-lg border bg-surface" aria-labelledby="schedule-h">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 id="schedule-h" className="text-sm font-semibold">
                Расписание
              </h2>
              <p className="text-xs text-text-secondary">Регулярные занятия группы и срок их действия.</p>
            </div>
            {canManage && options && card.isActive && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <CalendarPlus /> Добавить
              </Button>
            )}
          </div>
          {active.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-secondary">
              Регулярных занятий нет.{canManage && " Нажмите «Добавить», чтобы задать дни, время и срок."}
            </p>
          ) : (
            <ul className="divide-y">
              {active.map((s) => (
                <SeriesRow key={s.id} s={s} today={today} canManage={canManage} onEdit={() => setEnding(s)} />
              ))}
            </ul>
          )}
          {finished.length > 0 && (
            <details className="border-t px-4 py-2 text-sm">
              <summary className="cursor-pointer py-1 text-text-secondary">Завершённые ({finished.length})</summary>
              <ul className="divide-y">
                {finished.map((s) => (
                  <SeriesRow key={s.id} s={s} today={today} canManage={canManage} onEdit={() => setEnding(s)} />
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <Journal card={card} month={month} />

      {canManage && (
        <>
          <GroupSheet
            open={edit}
            onOpenChange={setEdit}
            teachers={teachers}
            initial={{ id: card.id, name: card.name, subject: card.subject, program: card.program, teacherId: card.teacher.id, maxStudents: card.maxStudents, isActive: card.isActive }}
          />
          {add && (
            <AddMemberDialog
              groupId={card.id}
              today={today}
              clients={clients.filter((c) => !memberIds.has(c.id))}
              program={card.program}
              onClose={() => setAdd(false)}
            />
          )}
          {remove && <RemoveMemberDialog groupId={card.id} member={remove} today={today} onClose={() => setRemove(null)} />}
          {options && (
            <CreateLessonSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              options={options}
              defaults={{ date: today, groupId: card.id, teacherId: card.teacher.id, weekly: true }}
              onCreated={() => router.refresh()}
            />
          )}
          {ending && <EndDialog series={ending} today={today} onClose={() => setEnding(null)} />}
        </>
      )}
    </div>
  );
}

const CELL: Record<JournalCell, { text: string; className: string; label: string }> = {
  present: { text: "✓", className: "bg-done-soft text-done", label: "был" },
  excused: { text: "У", className: "bg-warning-soft text-warning", label: "пропуск по уважительной причине" },
  unexcused: { text: "Н", className: "bg-danger-soft text-danger", label: "пропуск без уважительной причины" },
  unmarked: { text: "?", className: "text-danger ring-1 ring-danger/40 ring-inset", label: "урок не отмечен" },
  planned: { text: "", className: "", label: "запланирован" },
  cancelled: { text: "—", className: "bg-cancelled-soft text-cancelled", label: "урок отменён" },
  none: { text: "", className: "bg-subtle/70", label: "не в группе" },
};

/** Журнал посещаемости «ученики × даты» за месяц. */
function Journal({ card, month }: { card: GroupCard; month: Month }) {
  const { lessons, rows } = card.journal;
  return (
    <section className="rounded-lg border bg-surface" aria-labelledby="journal-h">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 id="journal-h" className="text-sm font-semibold">
          Журнал посещаемости
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Предыдущий месяц" asChild>
            <Link href={`/groups/${card.id}?month=${month.prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-32 text-center text-sm font-medium capitalize">
            {monthName(month.month)} {month.year}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Следующий месяц" asChild>
            <Link href={`/groups/${card.id}?month=${month.next}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
      {lessons.length === 0 || rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-text-secondary">
          {lessons.length === 0 ? "В этом месяце у группы нет уроков." : "В этом месяце в группе не было учеников."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-text-secondary">
                  <th className="sticky left-0 z-10 min-w-44 bg-surface px-4 py-2 text-left font-medium">Ученик</th>
                  {lessons.map((l) => {
                    const start = new Date(l.startsAt);
                    const d = localDateOf(start);
                    return (
                      <th key={l.id} className="px-1 py-2 text-center text-xs font-medium whitespace-nowrap">
                        <Link href={`/lessons?lesson=${l.id}&date=${d}`} className="hover:text-text-primary hover:underline" title={`${formatLocalDate(d)} ${formatTime(start)}`}>
                          {weekdayShort(isoWeekday(d))}
                          <br />
                          {formatDayMonth(d)}
                        </Link>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">Посещаемость</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.client.id} className="border-t">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-1.5">
                      <Link href={`/clients/${r.client.id}`} className="hover:underline">
                        {r.client.fullName}
                      </Link>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={lessons[i].id} className="px-1 py-1.5 text-center">
                        <span
                          className={cn("inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold", CELL[c].className)}
                          title={CELL[c].label}
                          aria-label={CELL[c].label}
                        >
                          {CELL[c].text}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {r.summary.percent === null ? (
                        <span className="text-text-secondary">—</span>
                      ) : (
                        <>
                          {r.summary.percent}%{" "}
                          <span className="text-xs text-text-secondary">
                            ({r.summary.present} из {r.summary.present + r.summary.excused + r.summary.unexcused})
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-text-secondary">
            {(["present", "excused", "unexcused", "unmarked", "cancelled"] as const).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className={cn("inline-flex size-5 items-center justify-center rounded text-[11px] font-semibold", CELL[c].className)}>{CELL[c].text}</span>
                {CELL[c].label}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AddMemberDialog({
  groupId,
  today,
  clients,
  program,
  onClose,
}: {
  groupId: string;
  today: LocalDate;
  clients: { id: string; fullName: string; program: "EXAM" | "SCHOOL" }[];
  program: "EXAM" | "SCHOOL";
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [from, setFrom] = useState(today);
  const [pending, startTransition] = useTransition();
  const other = clientId && clients.find((c) => c.id === clientId)?.program !== program;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Добавить ученика в группу</DialogTitle>
          <DialogDescription>Уроки группы с выбранной даты станут его: посещаемость, счёт абонемента или оплата за урок.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ученик</Label>
            <SearchableSelect options={clients.map((c) => ({ value: c.id, label: c.fullName }))} value={clientId} onChange={setClientId} placeholder="Выберите ученика" />
            {other && <p className="text-xs text-warning">У ученика другая программа — проверьте, что группа ему подходит.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-from">С даты</Label>
            <Input id="member-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={pending || !clientId || !from}
            onClick={() =>
              startTransition(async () => {
                const r = await addMemberAction(groupId, clientId!, from);
                if (r.ok) {
                  toast.success(r.message ?? "Добавлен");
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({ groupId, member, today, onClose }: { groupId: string; member: { id: string; fullName: string }; today: LocalDate; onClose: () => void }) {
  const [from, setFrom] = useState(today);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Вывести из группы: {member.fullName}?</DialogTitle>
          <DialogDescription>Уроки группы с этой даты уже не его. Прошлая посещаемость и оплаты останутся в истории.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="member-to">Не ходит с</Label>
          <Input id="member-to" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Назад
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !from}
            onClick={() =>
              startTransition(async () => {
                const r = await removeMemberAction(groupId, member.id, from);
                if (r.ok) {
                  toast.success(r.message ?? "Готово");
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            Вывести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
