"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, Calculator, ClipboardPlus, Columns3, Copy, List, Loader2Icon, MessageSquare, Phone, Plus, Search, StickyNote, TriangleAlert, UserCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { addDays, localDateOf } from "@/domain/calendar";
import { LEAD_SOURCE_LABEL, LEAD_STAGES, LEAD_STAGE_LABEL, LOST_REASONS, type ConversionRow, type LeadStage } from "@/domain/crm";
import { formatDate, formatRub, formatTime, WEEKDAYS_SHORT } from "@/domain/format";
import { cn } from "@/lib/utils";
import type { LeadRow } from "@/server/leads/service";
import { addTouchAction, convertLeadAction, leadTouchesAction, offerAction, saveLeadAction, scheduleTrialAction, setStageAction, type LeadPayload } from "./actions";

const STAGE_TONE: Record<LeadStage, StatusTone> = {
  NEW: "planned",
  CONTACTED: "moved",
  TRIAL_SCHEDULED: "warning",
  TRIAL_DONE: "warning",
  WON: "done",
  LOST: "cancelled",
};
const TOUCH_ICON = { call: Phone, message: MessageSquare, note: StickyNote, stage: UserCheck } as const;

type Staff = { id: string; name: string };
type TeacherOpt = { id: string; fullName: string; subjects: string[] };

export function LeadsView(p: {
  leads: LeadRow[];
  stats: { rows: ConversionRow[]; total: ConversionRow };
  period: { from: string; to: string };
  view: "board" | "table";
  filters: { q?: string; source?: string; owner?: string };
  staff: Staff[];
  teachers: TeacherOpt[];
  openLeadId?: string;
  createOpen: boolean;
  today: string;
  me: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(p.openLeadId ?? null);
  const [create, setCreate] = useState(p.createOpen);
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lead = p.leads.find((l) => l.id === openId) ?? null;

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const moveTo = (id: string, stage: LeadStage) => {
    if (stage === "LOST") return setLostFor(id);
    startTransition(async () => {
      const r = await setStageAction(id, stage);
      if (r.ok) toast.success(`Этап: ${LEAD_STAGE_LABEL[stage]}`);
      else toast.error(r.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Статистика по источникам за период */}
      <div className="rounded-lg border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Заявки за период</span>
          <Input type="date" aria-label="С" className="h-8 w-36" value={p.period.from} onChange={(e) => set("from", e.target.value)} />
          —
          <Input type="date" aria-label="По" className="h-8 w-36" value={p.period.to} onChange={(e) => set("to", e.target.value)} />
          <span className="ml-auto">
            Всего <b>{p.stats.total.total}</b> · оплатили <b>{p.stats.total.won}</b> · конверсия <b>{p.stats.total.conversion}%</b>
          </span>
        </div>
        {p.stats.rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.stats.rows.map((r) => (
              <div key={r.source} className="rounded-md border bg-subtle/60 px-3 py-1.5 text-sm">
                <span className="font-medium">{LEAD_SOURCE_LABEL[r.source]}</span>
                <span className="text-text-secondary">
                  {" "}
                  · {r.total} заявок · {r.won} оплатили · {r.conversion}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="Вид">
          {(
            [
              ["board", "Воронка", Columns3],
              ["table", "Таблица", List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={p.view === v}
              onClick={() => set("view", v === "board" ? null : v)}
              className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-text-secondary", p.view === v && "bg-brand-soft text-brand-text")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <form
          className="relative w-60"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim() || null);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
          <Input name="q" defaultValue={p.filters.q} placeholder="Имя, родитель, телефон" className="h-9 bg-surface pl-9" aria-label="Поиск лидов" />
        </form>
        <Select value={p.filters.source ?? "all"} onValueChange={(v) => set("source", v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-40" aria-label="Источник">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Источник: все</SelectItem>
            {Object.entries(LEAD_SOURCE_LABEL).map(([k, l]) => (
              <SelectItem key={k} value={k}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={p.filters.owner ?? "all"} onValueChange={(v) => set("owner", v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-44" aria-label="Ответственный">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ответственный: все</SelectItem>
            {p.staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(p.filters.q || p.filters.source || p.filters.owner) && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/leads")}>
            <X /> Сбросить
          </Button>
        )}
        <Button className="ml-auto" onClick={() => setCreate(true)}>
          <Plus /> Лид
        </Button>
      </div>

      {p.leads.length === 0 ? (
        <EmptyState icon={UserPlus} title="Заявок нет" hint="Добавьте заявку кнопкой «+ Лид» — с сайта, Авито, ВКонтакте или по рекомендации." />
      ) : p.view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {LEAD_STAGES.map((stage) => {
            const items = p.leads.filter((l) => l.stage === stage);
            return (
              <section
                key={stage}
                aria-label={LEAD_STAGE_LABEL[stage]}
                className={cn("w-64 shrink-0 rounded-lg border bg-subtle/60 p-2", dragId && "outline-2 outline-dashed outline-brand/30")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const l = p.leads.find((x) => x.id === dragId);
                  if (l && l.stage !== stage) moveTo(l.id, stage);
                  setDragId(null);
                }}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {LEAD_STAGE_LABEL[stage]}
                  <span className="text-xs font-normal text-text-secondary">{items.length}</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((l) => (
                    <li
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setOpenId(l.id)}
                      className={cn("cursor-grab rounded-md border bg-surface p-3 text-sm hover:border-brand/40 active:cursor-grabbing", l.needsTouch && "border-l-[3px] border-l-warning")}
                    >
                      <div className="font-medium">{l.childName}</div>
                      <div className="text-xs text-text-secondary">
                        {[l.grade ? `${l.grade} кл.` : null, l.subject, LEAD_SOURCE_LABEL[l.source]].filter(Boolean).join(" · ")}
                      </div>
                      {l.trialLesson && stage === "TRIAL_SCHEDULED" && (
                        <div className="mt-1 text-xs text-warning">Пробный {formatDate(new Date(l.trialLesson.startsAt))} {formatTime(new Date(l.trialLesson.startsAt))}</div>
                      )}
                      {l.lostReason && <div className="mt-1 text-xs text-text-secondary">{l.lostReason}</div>}
                      {l.needsTouch && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-warning">
                          <TriangleAlert className="size-3" /> нет касания больше 2 дней
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ребёнок</th>
                <th className="px-4 py-2.5 font-medium">Родитель и телефон</th>
                <th className="px-4 py-2.5 font-medium">Предмет</th>
                <th className="px-4 py-2.5 font-medium">Источник</th>
                <th className="px-4 py-2.5 font-medium">Этап</th>
                <th className="px-4 py-2.5 font-medium">Ответственный</th>
                <th className="px-4 py-2.5 font-medium">Последнее касание</th>
                <th className="px-4 py-2.5 font-medium">Заявка</th>
              </tr>
            </thead>
            <tbody>
              {p.leads.map((l) => (
                <tr key={l.id} className="cursor-pointer border-t hover:bg-subtle/60" onClick={() => setOpenId(l.id)}>
                  <td className="px-4 py-2.5 font-medium">
                    {l.childName}
                    {l.grade && <span className="text-text-secondary"> · {l.grade} кл.</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.parentName ?? "—"}
                    <span className="block text-xs text-text-secondary">{l.phone}</span>
                  </td>
                  <td className="px-4 py-2.5">{l.subject ?? "—"}</td>
                  <td className="px-4 py-2.5">{LEAD_SOURCE_LABEL[l.source]}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={STAGE_TONE[l.stage]}>{LEAD_STAGE_LABEL[l.stage]}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5">{l.owner?.name ?? "—"}</td>
                  <td className={cn("px-4 py-2.5", l.needsTouch && "text-warning")}>{l.lastTouchAt ? formatDate(new Date(l.lastTouchAt)) : "не было"}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{formatDate(new Date(l.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadSheet
        open={create || !!lead}
        lead={create ? null : lead}
        onClose={() => {
          setCreate(false);
          setOpenId(null);
          if (p.createOpen || p.openLeadId) {
            const next = new URLSearchParams(params.toString());
            next.delete("create");
            next.delete("lead");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }
        }}
        staff={p.staff}
        teachers={p.teachers}
        today={p.today}
        me={p.me}
        onLost={(id) => setLostFor(id)}
      />
      <LostDialog leadId={lostFor} onClose={() => setLostFor(null)} />
    </div>
  );
}

function LostDialog({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [other, setOther] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Отказ</DialogTitle>
          <DialogDescription>Причина нужна для отчёта по воронке.</DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger aria-label="Причина отказа" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOST_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reason === "Другое" && <Input aria-label="Своя причина" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Опишите причину" />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Назад
          </Button>
          <Button
            variant="destructive"
            disabled={pending || (reason === "Другое" && !other.trim())}
            onClick={() =>
              startTransition(async () => {
                const r = await setStageAction(leadId!, "LOST", reason === "Другое" ? other : reason);
                if (r.ok) {
                  toast.success("Заявка закрыта: отказ");
                  onClose();
                } else toast.error(r.error);
              })
            }
          >
            Отказ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadSheet({
  open,
  lead,
  onClose,
  staff,
  teachers,
  today,
  me,
  onLost,
}: {
  open: boolean;
  lead: LeadRow | null;
  onClose: () => void;
  staff: Staff[];
  teachers: TeacherOpt[];
  today: string;
  me: string;
  onLost: (id: string) => void;
}) {
  const [dialog, setDialog] = useState<null | "trial" | "offer" | "convert">(null);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="border-b">
          <SheetTitle>{lead ? lead.childName : "Новая заявка"}</SheetTitle>
          <SheetDescription asChild>
            <div>{lead ? <StatusBadge tone={STAGE_TONE[lead.stage]}>{LEAD_STAGE_LABEL[lead.stage]}</StatusBadge> : "Имя ребёнка, телефон и источник — обязательно."}</div>
          </SheetDescription>
        </SheetHeader>
        {open && (
          <div className="space-y-6 p-4">
            {lead && (
              <>
                <div className="flex flex-wrap gap-2">
                  {lead.convertedClientId ? (
                    <Button asChild>
                      <Link href={`/clients/${lead.convertedClientId}`}>
                        <UserCheck /> Карточка ученика
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setDialog("trial")}>
                        <CalendarPlus /> {lead.trialLesson?.status === "PLANNED" ? "Перенести пробный" : "Назначить пробный урок"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDialog("offer")}>
                        <Calculator /> Рассчитать предложение
                      </Button>
                      <Button size="sm" onClick={() => setDialog("convert")}>
                        <UserCheck /> Перевести в клиенты
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/tasks?create=1&lead=${lead.id}`}>
                      <ClipboardPlus /> Задача
                    </Link>
                  </Button>
                </div>
                {lead.trialLesson && (
                  <Link
                    href={`/lessons?view=day&date=${localDateOf(new Date(lead.trialLesson.startsAt))}&lesson=${lead.trialLesson.id}`}
                    className="block rounded-md bg-warning-soft px-3 py-2 text-sm text-warning hover:underline"
                  >
                    Пробный урок: {formatDate(new Date(lead.trialLesson.startsAt))} {formatTime(new Date(lead.trialLesson.startsAt))}
                    {lead.trialLesson.status === "DONE" ? " — проведён" : lead.trialLesson.status === "CANCELLED" ? " — отменён" : ""}
                  </Link>
                )}
                {!lead.convertedClientId && <StageControl lead={lead} onLost={() => onLost(lead.id)} />}
                <Touches leadId={lead.id} />
              </>
            )}
            <LeadForm key={lead?.id ?? "new"} lead={lead} staff={staff} me={me} onSaved={() => !lead && onClose()} />
          </div>
        )}
        {lead && dialog === "trial" && <TrialDialog lead={lead} teachers={teachers} today={today} onClose={() => setDialog(null)} />}
        {lead && dialog === "offer" && <OfferDialog lead={lead} onClose={() => setDialog(null)} />}
        {lead && dialog === "convert" && <ConvertDialog lead={lead} onClose={() => setDialog(null)} />}
      </SheetContent>
    </Sheet>
  );
}

function StageControl({ lead, onLost }: { lead: LeadRow; onLost: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-1.5">
      <Label>Этап воронки</Label>
      <div className="flex flex-wrap gap-1.5">
        {LEAD_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            aria-pressed={lead.stage === s}
            onClick={() => {
              if (s === lead.stage) return;
              if (s === "LOST") return onLost();
              startTransition(async () => {
                const r = await setStageAction(lead.id, s);
                if (r.ok) toast.success(`Этап: ${LEAD_STAGE_LABEL[s]}`);
                else toast.error(r.error);
              });
            }}
            className={cn(
              "h-7 rounded-sm border px-2 text-xs font-medium text-text-secondary hover:bg-subtle",
              lead.stage === s && "border-brand bg-brand-soft text-brand-text",
            )}
          >
            {LEAD_STAGE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Touches({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<{ id: string; kind: string; text: string; at: string; author: string }[]>([]);
  const [kind, setKind] = useState<"call" | "message" | "note">("call");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    void leadTouchesAction(leadId).then(setItems);
  }, [leadId]);
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">История касаний</h3>
      <div className="flex gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-32" aria-label="Вид касания">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="call">Звонок</SelectItem>
            <SelectItem value="message">Сообщение</SelectItem>
            <SelectItem value="note">Заметка</SelectItem>
          </SelectContent>
        </Select>
        <Input aria-label="Что обсудили" value={text} onChange={(e) => setText(e.target.value)} placeholder="Что обсудили" />
        <Button
          variant="outline"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await addTouchAction(leadId, kind, text);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success(r.message ?? "Записано");
              setText("");
              setItems(await leadTouchesAction(leadId));
            })
          }
        >
          Записать
        </Button>
      </div>
      <ul className="space-y-1.5">
        {items.map((t) => {
          const Icon = TOUCH_ICON[t.kind as keyof typeof TOUCH_ICON] ?? StickyNote;
          return (
            <li key={t.id} className="flex gap-2 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-text-secondary" />
              <span className="flex-1">
                {t.text}
                <span className="block text-xs text-text-secondary">
                  {formatDate(new Date(t.at))} {formatTime(new Date(t.at))} · {t.author}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LeadForm({ lead, staff, me, onSaved }: { lead: LeadRow | null; staff: Staff[]; me: string; onSaved: () => void }) {
  const [v, setV] = useState<LeadPayload>({
    childName: lead?.childName ?? "",
    grade: lead?.grade ?? null,
    parentName: lead?.parentName ?? "",
    phone: lead?.phone ?? "",
    source: lead?.source ?? "SITE",
    subject: lead?.subject ?? "математика",
    program: lead?.program ?? "EXAM",
    goal: lead?.goal ?? "",
    preferredTime: lead?.preferredTime ?? "",
    comment: lead?.comment ?? "",
    ownerId: lead?.owner?.id ?? me,
  });
  const [pending, startTransition] = useTransition();
  const field = (k: keyof LeadPayload) => ({
    value: (v[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }),
  });
  return (
    <form
      className="space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await saveLeadAction(lead?.id ?? null, v);
          if (r.ok) {
            toast.success(r.message ?? "Сохранено");
            onSaved();
          } else toast.error(r.error);
        });
      }}
    >
      <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">Заявка</h3>
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="l-child">Ребёнок</Label>
          <Input id="l-child" {...field("childName")} required placeholder="Миша Иванов" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="l-grade">Класс</Label>
          <Input id="l-grade" type="number" min={1} max={11} value={v.grade ?? ""} onChange={(e) => setV({ ...v, grade: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="l-parent">Родитель</Label>
          <Input id="l-parent" {...field("parentName")} placeholder="Иванова Ольга Петровна" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="l-phone">Телефон</Label>
          <Input id="l-phone" {...field("phone")} required placeholder="+7 914 000-00-00" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="l-source">Источник</Label>
          <Select value={v.source} onValueChange={(x) => setV({ ...v, source: x as "SITE" })}>
            <SelectTrigger id="l-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEAD_SOURCE_LABEL).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="l-subject">Предмет</Label>
          <Input id="l-subject" {...field("subject")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="l-program">Программа</Label>
          <Select value={v.program ?? "EXAM"} onValueChange={(x) => setV({ ...v, program: x as "EXAM" })}>
            <SelectTrigger id="l-program" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXAM">ОГЭ / ЕГЭ</SelectItem>
              <SelectItem value="SCHOOL">Школьная</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="l-goal">Цель</Label>
          <Input id="l-goal" {...field("goal")} placeholder="ОГЭ на 5" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="l-time">Удобное время</Label>
          <Input id="l-time" {...field("preferredTime")} placeholder="будни после 16:00" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="l-owner">Ответственный</Label>
        <Select value={v.ownerId ?? me} onValueChange={(x) => setV({ ...v, ownerId: x })}>
          <SelectTrigger id="l-owner" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="l-comment">Комментарий</Label>
        <Textarea id="l-comment" rows={2} {...field("comment")} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {lead ? "Сохранить" : "Добавить заявку"}
      </Button>
    </form>
  );
}

function TrialDialog({ lead, teachers, today, onClose }: { lead: LeadRow; teachers: TeacherOpt[]; today: string; onClose: () => void }) {
  const [teacherId, setTeacherId] = useState(teachers.find((t) => t.subjects.some((s) => s.toLowerCase() === (lead.subject ?? "").toLowerCase()))?.id ?? teachers[0]?.id ?? "");
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("16:00");
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Пробный урок</DialogTitle>
          <DialogDescription>Для ученика бесплатно. Урок появится в расписании педагога.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tr-teacher">Педагог</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger id="tr-teacher" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-date">Дата</Label>
              <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-time">Время</Label>
              <Input id="tr-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-dur">Минут</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="tr-dur" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["45", "60", "90"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={pending || !teacherId}
            onClick={() =>
              startTransition(async () => {
                const r = await scheduleTrialAction(lead.id, { teacherId, date, time, durationMin: Number(duration), subject: lead.subject ?? "математика" });
                if (r.ok) {
                  toast.success(r.message ?? "Назначено");
                  onClose();
                } else setError(r.error);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Назначить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferDialog({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const [weekdays, setWeekdays] = useState<number[]>([2, 5]);
  const [duration, setDuration] = useState(60);
  const [result, setResult] = useState<null | { lessonsCount: number; amount: number; perLessonAmount: number; savings: number; text: string }>(null);
  const [pending, startTransition] = useTransition();
  const calc = (days: number[], dur: number) =>
    startTransition(async () => {
      if (!days.length) return setResult(null);
      const r = await offerAction(lead.id, days.map((d) => ({ weekday: d, durationMin: dur })));
      if (r.ok && r.data) setResult(r.data);
      else if (!r.ok) toast.error(r.error);
    });
  useEffect(() => calc(weekdays, duration), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Предложение для {lead.childName}</DialogTitle>
          <DialogDescription>Выберите дни и длительность — расчёт на следующий месяц по тарифам школы.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {WEEKDAYS_SHORT.map((label, i) => {
            const wd = i + 1;
            const on = weekdays.includes(wd);
            return (
              <button
                key={wd}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? weekdays.filter((x) => x !== wd) : [...weekdays, wd].sort();
                  setWeekdays(next);
                  calc(next, duration);
                }}
                className={on ? "h-8 w-10 rounded-md bg-brand text-sm font-medium text-white" : "h-8 w-10 rounded-md border text-sm text-text-secondary"}
              >
                {label}
              </button>
            );
          })}
          <Select
            value={String(duration)}
            onValueChange={(v) => {
              setDuration(Number(v));
              calc(weekdays, Number(v));
            }}
          >
            <SelectTrigger className="ml-auto w-28" aria-label="Длительность">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[45, 60, 90].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} мин
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pending && !result && <Loader2Icon className="animate-spin" />}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border p-2">
                <div className="text-xs text-text-secondary">Уроков в месяце</div>
                <b>{result.lessonsCount}</b>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-text-secondary">Абонемент</div>
                <b>{formatRub(result.amount)}</b>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-text-secondary">Поурочно</div>
                <b>{formatRub(result.perLessonAmount)}</b>
              </div>
            </div>
            <pre className="rounded-md border bg-subtle p-3 font-sans text-sm whitespace-pre-wrap">{result.text}</pre>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              void navigator.clipboard.writeText(result!.text);
              toast.success("Текст скопирован — отправьте его родителю");
            }}
          >
            <Copy /> Копировать текст
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const router = useRouter();
  const parts = lead.childName.trim().split(/\s+/);
  const [v, setV] = useState({
    fullName: parts.length >= 2 ? `${parts[1]} ${parts[0]}` : lead.childName,
    gender: null as "MALE" | "FEMALE" | null,
    grade: lead.grade,
    program: (lead.program ?? "EXAM") as "EXAM" | "SCHOOL",
    paymentMode: "MONTHLY" as "MONTHLY" | "PER_LESSON",
    parentName: lead.parentName ?? "",
    parentPhone: lead.phone,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Перевести в клиенты</DialogTitle>
          <DialogDescription>Пробный урок и история касаний сохранятся в карточке ученика.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cv-name">Фамилия и имя ученика</Label>
            <Input id="cv-name" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cv-gender">Пол</Label>
              <Select value={v.gender ?? "none"} onValueChange={(x) => setV({ ...v, gender: x === "none" ? null : (x as "MALE") })}>
                <SelectTrigger id="cv-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Мужской</SelectItem>
                  <SelectItem value="FEMALE">Женский</SelectItem>
                  <SelectItem value="none">—</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-grade">Класс</Label>
              <Input id="cv-grade" type="number" value={v.grade ?? ""} onChange={(e) => setV({ ...v, grade: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-mode">Оплата</Label>
              <Select value={v.paymentMode} onValueChange={(x) => setV({ ...v, paymentMode: x as "MONTHLY" })}>
                <SelectTrigger id="cv-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Абонемент</SelectItem>
                  <SelectItem value="PER_LESSON">Поурочно</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cv-parent">Родитель</Label>
              <Input id="cv-parent" value={v.parentName} onChange={(e) => setV({ ...v, parentName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-phone">Телефон</Label>
              <Input id="cv-phone" value={v.parentPhone} onChange={(e) => setV({ ...v, parentPhone: e.target.value })} />
            </div>
          </div>
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await convertLeadAction(lead.id, v);
                if (r.ok) {
                  toast.success(r.message ?? "Готово");
                  router.push(`/clients/${r.data?.clientId}`);
                } else setError(r.error);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Создать ученика
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


