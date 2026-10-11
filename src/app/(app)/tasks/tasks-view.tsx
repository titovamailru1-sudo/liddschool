"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Bot, Check, ClipboardList, Columns3, List, Loader2Icon, MessageSquare, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { localDateOf } from "@/domain/calendar";
import { formatDate, formatDayMonth, formatTime } from "@/domain/format";
import { TASK_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { TaskFilters, TaskRow } from "@/server/tasks/service";
import { addTaskCommentAction, createTaskAction, setTaskStatusAction, taskCommentsAction, updateTaskAction, type TaskPayload } from "./actions";

const DISPLAY = { new: TASK_STATUS.new, inProgress: TASK_STATUS.inProgress, overdue: TASK_STATUS.overdue, done: TASK_STATUS.done };
const TYPE_LABEL: Record<string, string> = { debt: "Долг", subscription: "Абонемент", lesson: "Урок", lead: "Лид", payroll: "Зарплата", other: "Другое" };
const COLUMNS = [
  { status: "NEW", label: "Новые" },
  { status: "IN_PROGRESS", label: "В работе" },
  { status: "DONE", label: "Выполнены" },
] as const;
const PRIORITY = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий" } as const;
const STATUS_BUTTON = { NEW: "Новая", IN_PROGRESS: "В работе", DONE: "Выполнена" } as const;

type Person = { id: string; name: string; role: string };
type Ref = { id: string; fullName: string };

export function TasksView(p: {
  tasks: TaskRow[];
  view: "list" | "board";
  filters: TaskFilters;
  people: Person[];
  clients: Ref[];
  leads: Ref[];
  me: string;
  isTeacher: boolean;
  createOpen: boolean;
  createDefaults: { clientId?: string; leadId?: string };
  openTaskId?: string;
  nowIso: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [create, setCreate] = useState(p.createOpen);
  const [openId, setOpenId] = useState<string | null>(p.openTaskId ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const open = p.tasks.find((t) => t.id === openId) ?? null;

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const changeStatus = (id: string, status: "NEW" | "IN_PROGRESS" | "DONE") =>
    startTransition(async () => {
      const r = await setTaskStatusAction(id, status);
      if (r.ok) toast.success(r.message ?? "Готово");
      else toast.error(r.error);
    });
  const hasFilters = !!(p.filters.assigneeId || p.filters.due || p.filters.type || p.filters.auto !== undefined || p.filters.clientId || p.filters.leadId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="Вид задач">
          {(
            [
              ["list", "Список", List],
              ["board", "Доска", Columns3],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={p.view === v}
              onClick={() => set("view", v === "list" ? null : v)}
              className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-text-secondary", p.view === v && "bg-brand-soft text-brand-text")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {!p.isTeacher && (
          <Filter
            label="Исполнитель"
            value={p.filters.assigneeId}
            onChange={(v) => set("assignee", v)}
            options={[["me", "Мои"], ...p.people.map((x) => [x.id, x.name] as [string, string])]}
          />
        )}
        <Filter label="Срок" value={p.filters.due} onChange={(v) => set("due", v)} options={[["overdue", "Просроченные"], ["today", "Сегодня"], ["week", "На неделе"]]} />
        <Filter label="Тип" value={p.filters.type} onChange={(v) => set("type", v)} options={Object.entries(TYPE_LABEL)} />
        <Filter
          label="Откуда"
          value={p.filters.auto === undefined ? undefined : p.filters.auto ? "1" : "0"}
          onChange={(v) => set("auto", v)}
          options={[["1", "Автоматические"], ["0", "Созданные вручную"]]}
        />
        {!p.isTeacher && (
          <div className="w-48">
            <SearchableSelect options={p.clients.map((c) => ({ value: c.id, label: c.fullName }))} value={p.filters.clientId ?? null} onChange={(v) => set("client", v)} placeholder="Клиент" />
          </div>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push(p.view === "board" ? "/tasks?view=board" : "/tasks")}>
            <X /> Сбросить
          </Button>
        )}
        <Button className="ml-auto" onClick={() => setCreate(true)}>
          <Plus /> Задача
        </Button>
      </div>

      {p.tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title={hasFilters ? "Нет задач по фильтрам" : "Задач нет"} hint="Создайте задачу кнопкой «+ Задача». Автоматические задачи (долги, неотмеченные уроки, лиды) появятся сами." />
      ) : p.view === "list" ? (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Задача</th>
                <th className="px-3 py-2.5 font-medium">Связано с</th>
                {!p.isTeacher && <th className="px-3 py-2.5 font-medium">Исполнитель</th>}
                <th className="px-3 py-2.5 font-medium">Срок</th>
                <th className="px-3 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {p.tasks.map((t) => (
                <tr key={t.id} className={cn("cursor-pointer border-t hover:bg-subtle/60", t.status === "DONE" && "text-text-secondary")} onClick={() => setOpenId(t.id)}>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={t.status === "DONE" ? "Вернуть в работу" : "Отметить выполненной"}
                      onClick={(e) => {
                        e.stopPropagation();
                        changeStatus(t.id, t.status === "DONE" ? "NEW" : "DONE");
                      }}
                      className={cn("flex size-5 items-center justify-center rounded-full border", t.status === "DONE" ? "border-done bg-done text-white" : "border-border-strong hover:border-done")}
                    >
                      {t.status === "DONE" && <Check className="size-3" />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("font-medium", t.status === "DONE" && "line-through")}>{t.title}</span>
                    <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-text-secondary">
                      {t.isAuto && <Bot className="size-3.5" aria-label="Автоматическая" />}
                      {TYPE_LABEL[t.type] ?? t.type}
                      {t.priority === "HIGH" && <span className="text-danger">· срочно</span>}
                      {t.comments > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="size-3" /> {t.comments}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <LinkedTo t={t} />
                  </td>
                  {!p.isTeacher && <td className="px-3 py-2.5">{t.assignee?.name ?? "—"}</td>}
                  <td className={cn("px-3 py-2.5 whitespace-nowrap", t.display === "overdue" && "font-medium text-danger")}>{t.dueAt ? due(t.dueAt) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={DISPLAY[t.display].tone}>{DISPLAY[t.display].label}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = p.tasks.filter((t) => t.status === col.status);
            return (
              <section
                key={col.status}
                aria-label={col.label}
                className={cn("min-h-40 rounded-lg border bg-subtle/60 p-2", dragId && "outline-2 outline-dashed outline-brand/30")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const t = p.tasks.find((x) => x.id === dragId);
                  if (t && t.status !== col.status) changeStatus(t.id, col.status);
                  setDragId(null);
                }}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {col.label}
                  <span className="text-xs font-normal text-text-secondary">{items.length}</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((t) => (
                    <li
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setOpenId(t.id)}
                      className={cn(
                        "cursor-grab rounded-md border bg-surface p-3 text-sm shadow-xs hover:border-brand/40 active:cursor-grabbing",
                        t.display === "overdue" && "border-l-[3px] border-l-danger",
                      )}
                    >
                      <div className="mb-1 flex items-start gap-1.5 font-medium">
                        {t.isAuto && <Bot className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-label="Автоматическая" />}
                        <span className={cn(t.status === "DONE" && "text-text-secondary line-through")}>{t.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                        {t.dueAt && <span className={cn(t.display === "overdue" && "font-medium text-danger")}>{due(t.dueAt)}</span>}
                        {!p.isTeacher && t.assignee && <span>· {t.assignee.name}</span>}
                        <LinkedTo t={t} compact />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <TaskSheet
        open={create}
        onOpenChange={(o) => {
          setCreate(o);
          if (!o && p.createOpen) set("create", null);
        }}
        task={null}
        people={p.people}
        clients={p.clients}
        leads={p.leads}
        me={p.me}
        isTeacher={p.isTeacher}
        defaults={p.createDefaults}
      />
      <TaskSheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} task={open} people={p.people} clients={p.clients} leads={p.leads} me={p.me} isTeacher={p.isTeacher} />
    </div>
  );
}

function due(iso: string) {
  const d = new Date(iso);
  return `${formatDayMonth(localDateOf(d))} ${formatTime(d)}`;
}

function LinkedTo({ t, compact }: { t: TaskRow; compact?: boolean }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (t.client) return <Link onClick={stop} href={`/clients/${t.client.id}`} className="text-brand-text hover:underline">{compact ? `· ${t.client.fullName}` : t.client.fullName}</Link>;
  if (t.lead) return <Link onClick={stop} href={`/leads?lead=${t.lead.id}`} className="text-brand-text hover:underline">{compact ? `· лид ${t.lead.name}` : `Лид: ${t.lead.name}`}</Link>;
  if (t.lesson) {
    const d = new Date(t.lesson.startsAt);
    return (
      <Link onClick={stop} href={`/lessons?view=day&date=${localDateOf(d)}&lesson=${t.lesson.id}`} className="text-brand-text hover:underline">
        {compact ? "· урок" : `Урок ${formatDate(d)} ${formatTime(d)}`}
      </Link>
    );
  }
  return compact ? null : <span className="text-text-secondary">—</span>;
}

function Filter({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | null) => void; options: [string, string][] }) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger className={cn("h-9 w-auto min-w-32", value && "border-brand text-brand-text")} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}: все</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaskSheet({
  open,
  onOpenChange,
  task,
  people,
  clients,
  leads,
  me,
  isTeacher,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: TaskRow | null;
  people: Person[];
  clients: Ref[];
  leads: Ref[];
  me: string;
  isTeacher: boolean;
  defaults?: { clientId?: string; leadId?: string };
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle>{task ? task.title : "Новая задача"}</SheetTitle>
          <SheetDescription>
            {task?.isAuto ? "Автоматическая задача — закроется сама, когда событие разрешится." : task ? "Задача" : "Позвонить родителю, напомнить об оплате, подготовить материалы…"}
          </SheetDescription>
        </SheetHeader>
        {open && <TaskForm key={task?.id ?? "new"} task={task} people={people} clients={clients} leads={leads} me={me} isTeacher={isTeacher} defaults={defaults} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({
  task,
  people,
  clients,
  leads,
  me,
  isTeacher,
  defaults,
  onDone,
}: {
  task: TaskRow | null;
  people: Person[];
  clients: Ref[];
  leads: Ref[];
  me: string;
  isTeacher: boolean;
  defaults?: { clientId?: string; leadId?: string };
  onDone: () => void;
}) {
  const dueLocal = task?.dueAt ? localDateOf(new Date(task.dueAt)) : "";
  const [v, setV] = useState<TaskPayload>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    assigneeId: task?.assignee?.id ?? me,
    dueDate: dueLocal || null,
    dueTime: task?.dueAt ? formatTime(new Date(task.dueAt)) : null,
    priority: task?.priority ?? "NORMAL",
    clientId: task?.client?.id ?? defaults?.clientId ?? null,
    leadId: task?.lead?.id ?? defaults?.leadId ?? null,
  });
  const [comments, setComments] = useState<{ id: string; text: string; at: string; author: string }[]>([]);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (task) void taskCommentsAction(task.id).then(setComments);
  }, [task]);

  const save = () =>
    startTransition(async () => {
      const r = task ? await updateTaskAction(task.id, v) : await createTaskAction(v);
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onDone();
      } else toast.error(r.error);
    });

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex-1 space-y-4 p-4">
        {task && (
          <div className="flex flex-wrap gap-2">
            {(["NEW", "IN_PROGRESS", "DONE"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={task.status === s ? "default" : "outline"}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await setTaskStatusAction(task.id, s);
                    if (r.ok) {
                      toast.success(r.message ?? "Готово");
                      if (s === "DONE") onDone();
                    } else toast.error(r.error);
                  })
                }
              >
                {STATUS_BUTTON[s]}
              </Button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Что сделать</Label>
          <Input id="task-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required autoFocus={!task} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-desc">Описание</Label>
          <Textarea id="task-desc" rows={3} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-date">Срок</Label>
            <Input id="task-date" type="date" value={v.dueDate ?? ""} onChange={(e) => setV({ ...v, dueDate: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-time">Время</Label>
            <Input id="task-time" type="time" value={v.dueTime ?? ""} onChange={(e) => setV({ ...v, dueTime: e.target.value || null })} disabled={!v.dueDate} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!isTeacher && (
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Исполнитель</Label>
              <Select value={v.assigneeId ?? me} onValueChange={(x) => setV({ ...v, assigneeId: x })}>
                <SelectTrigger id="task-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">Приоритет</Label>
            <Select value={v.priority ?? "NORMAL"} onValueChange={(x) => setV({ ...v, priority: x as "NORMAL" })}>
              <SelectTrigger id="task-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!isTeacher && !task && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Клиент</Label>
              <SearchableSelect options={clients.map((c) => ({ value: c.id, label: c.fullName }))} value={v.clientId ?? null} onChange={(x) => setV({ ...v, clientId: x, leadId: null })} placeholder="Не выбран" />
            </div>
            <div className="space-y-1.5">
              <Label>Лид</Label>
              <SearchableSelect options={leads.map((c) => ({ value: c.id, label: c.fullName }))} value={v.leadId ?? null} onChange={(x) => setV({ ...v, leadId: x, clientId: null })} placeholder="Не выбран" />
            </div>
          </div>
        )}

        {task && (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">Комментарии</h3>
            {comments.length === 0 && <p className="text-sm text-text-secondary">Пока нет.</p>}
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-md bg-subtle px-3 py-2 text-sm">
                  <div className="text-xs text-text-secondary">
                    {c.author} · {formatDate(new Date(c.at))} {formatTime(new Date(c.at))}
                  </div>
                  <p className="whitespace-pre-wrap">{c.text}</p>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input aria-label="Новый комментарий" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Написать комментарий" />
              <Button
                type="button"
                variant="outline"
                disabled={!comment.trim() || pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await addTaskCommentAction(task.id, comment);
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    setComment("");
                    setComments(await taskCommentsAction(task.id));
                  })
                }
              >
                Отправить
              </Button>
            </div>
          </section>
        )}
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Закрыть
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {task ? "Сохранить" : "Создать задачу"}
        </Button>
      </SheetFooter>
    </form>
  );
}
