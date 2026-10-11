"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, ExternalLink, Loader2Icon, Video } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { localDateOf } from "@/domain/calendar";
import type { AttendanceStatus } from "@/domain/constants";
import { formatDate, formatRub, formatTime } from "@/domain/format";
import { LESSON_STATUS, PAYMENT_MODE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { LessonDetail } from "@/server/lessons/queries";
import { PaymentDialog, type PaymentTarget } from "@/components/billing/payment-dialog";
import { settleLessonAction, updateNotesAction, type ActionResult } from "../actions";
import { CancelDialog } from "./cancel-dialog";
import { MoveDialog } from "./move-dialog";

export interface LessonPermissions {
  canMark: boolean;
  canManage: boolean;
}

export function LessonSheet({
  lesson,
  perms,
  teachers,
  onClose,
  hrefFor,
  today,
}: {
  lesson: LessonDetail | null;
  perms: LessonPermissions;
  teachers: { id: string; fullName: string }[];
  onClose: () => void;
  hrefFor: (lessonId: string, date: string) => string;
  today: string;
}) {
  return (
    <Sheet open={!!lesson} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[520px]">
        {lesson && <LessonPanel key={lesson.id + lesson.status + (lesson.markedAt ?? "")} lesson={lesson} perms={perms} teachers={teachers} hrefFor={hrefFor} today={today} />}
      </SheetContent>
    </Sheet>
  );
}

function LessonPanel({
  lesson,
  perms,
  teachers,
  hrefFor,
  today,
}: {
  lesson: LessonDetail;
  perms: LessonPermissions;
  teachers: { id: string; fullName: string }[];
  hrefFor: (lessonId: string, date: string) => string;
  today: string;
}) {
  const startsAt = new Date(lesson.startsAt);
  const end = new Date(startsAt.getTime() + lesson.durationMin * 60_000);
  const status = LESSON_STATUS[lesson.displayStatus];
  const [pending, startTransition] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  function handle(r: ActionResult) {
    if (r.ok) toast.success(r.message ?? "Сохранено");
    else toast.error(r.error ?? "Не удалось сохранить");
  }

  const unmark = () => startTransition(async () => handle(await settleLessonAction(lesson.id, { kind: "PLANNED" })));
  const isMoved = lesson.status === "MOVED";
  const isPlanned = lesson.status === "PLANNED";

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {lesson.isTrial && <StatusBadge tone="moved">Пробный</StatusBadge>}
        </div>
        <SheetTitle className="text-lg">{lesson.title}</SheetTitle>
        <SheetDescription asChild>
          <div className="space-y-0.5 text-sm">
            <div className="font-medium text-text-primary">
              {formatDate(startsAt)}, {formatTime(startsAt)}–{formatTime(end)} · {lesson.durationMin} мин
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: lesson.teacher.color }} />
              {lesson.teacher.fullName} · {lesson.subject}
            </div>
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-4">
        {lesson.onlineUrl && !isMoved && (
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={lesson.onlineUrl} target="_blank" rel="noreferrer">
              <Video /> Открыть онлайн-занятие <ExternalLink className="ml-auto opacity-60" />
            </a>
          </Button>
        )}

        {lesson.movedTo && (
          <MovedNote label="Перенесён на" at={lesson.movedTo.startsAt} href={hrefFor(lesson.movedTo.id, localDateOf(new Date(lesson.movedTo.startsAt)))} />
        )}
        {lesson.movedFrom && (
          <MovedNote label="Перенесён с" at={lesson.movedFrom.startsAt} href={hrefFor(lesson.movedFrom.id, localDateOf(new Date(lesson.movedFrom.startsAt)))} />
        )}
        {lesson.status === "CANCELLED" && (
          <p className="rounded-md bg-subtle px-3 py-2 text-sm">
            {lesson.cancelledBy === "CLIENT" ? "Ученик предупредил заранее — уважительный пропуск." : "Урок отменён школой."}
            {lesson.cancelReason && <span className="block text-text-secondary">{lesson.cancelReason}</span>}
          </p>
        )}

        {perms.canMark && !isMoved && lesson.status !== "CANCELLED" && (
          <Section title={lesson.isGroup ? "Посещаемость" : "Отметка"}>
            {lesson.isGroup ? (
              <GroupAttendance lesson={lesson} />
            ) : (
              <IndividualMark lesson={lesson} />
            )}
          </Section>
        )}

        {!perms.canMark && lesson.students.length > 0 && (
          <Section title="Ученики">
            <ul className="text-sm">{lesson.students.map((s) => <li key={s.clientId}>{s.fullName}</li>)}</ul>
          </Section>
        )}

        {perms.canMark && !isMoved && <NotesForm lesson={lesson} canEditLink={perms.canManage} />}

        {(perms.canManage || (perms.canMark && lesson.status === "DONE")) && !isMoved && (
          <Section title="Действия">
            <div className="flex flex-wrap gap-2">
              {perms.canManage && isPlanned && (
                <Button variant="outline" onClick={() => setMoveOpen(true)}>
                  Перенести
                </Button>
              )}
              {perms.canManage && lesson.status !== "CANCELLED" && (
                <Button variant="outline" onClick={() => setCancelOpen(true)}>
                  Отменить урок
                </Button>
              )}
              {perms.canManage && lesson.status === "CANCELLED" && (
                <Button variant="outline" disabled={pending} onClick={unmark}>
                  Вернуть в расписание
                </Button>
              )}
              {lesson.status === "DONE" && (
                <Button variant="ghost" disabled={pending} onClick={unmark}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  Снять отметку
                </Button>
              )}
            </div>
          </Section>
        )}

        {lesson.perLesson.length > 0 && !isMoved && lesson.status !== "CANCELLED" && <PerLessonBlock lesson={lesson} today={today} />}

        {lesson.finance && <FinanceBlock finance={lesson.finance} />}

        <div className="space-y-0.5 border-t pt-3 text-xs text-text-secondary">
          {lesson.seriesId && <div>Из регулярного расписания</div>}
          {lesson.createdBy && <div>Создал: {lesson.createdBy}</div>}
          {lesson.markedBy && lesson.markedAt && (
            <div>
              Отметил: {lesson.markedBy}, {formatDate(new Date(lesson.markedAt))} {formatTime(new Date(lesson.markedAt))}
            </div>
          )}
        </div>
      </div>

      <MoveDialog open={moveOpen} onOpenChange={setMoveOpen} lesson={lesson} teachers={teachers} />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        lesson={lesson}
        onMoveInstead={
          isPlanned
            ? () => {
                setCancelOpen(false);
                setMoveOpen(true);
              }
            : undefined
        }
      />
    </>
  );
}

const PAY_STATE = {
  paid: { label: "Оплачено", tone: "done" },
  atRisk: { label: "Под угрозой", tone: "danger" },
  linkSent: { label: "Ссылка отправлена", tone: "warning" },
  pending: { label: "Ожидается", tone: "planned" },
} as const;

/** Оплата урока поурочниками: статус и «Принять оплату». */
function PerLessonBlock({ lesson, today }: { lesson: LessonDetail; today: string }) {
  const [payFor, setPayFor] = useState<PaymentTarget | null>(null);
  const start = new Date(lesson.startsAt);
  return (
    <Section title="Оплата урока">
      <ul className="divide-y rounded-lg border text-sm">
        {lesson.perLesson.map((s) => (
          <li key={s.clientId} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1 truncate">{s.fullName}</span>
            <span className="tabular-nums">{formatRub(s.price)}</span>
            <StatusBadge tone={PAY_STATE[s.state].tone}>{PAY_STATE[s.state].label}</StatusBadge>
            {s.state !== "paid" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPayFor({
                    clientId: s.clientId,
                    clientName: s.fullName,
                    lessonId: lesson.id,
                    lessonLabel: `Урок ${formatDate(start)} ${formatTime(start)}`,
                    amount: s.price,
                  })
                }
              >
                Принять
              </Button>
            )}
          </li>
        ))}
      </ul>
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} target={payFor} today={today} />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">{title}</h3>
      {children}
    </section>
  );
}

function MovedNote({ label, at, href }: { label: string; at: string; href: string }) {
  const d = new Date(at);
  return (
    <Link href={href} scroll={false} className="flex items-center gap-2 rounded-md bg-moved-soft px-3 py-2 text-sm text-moved hover:underline">
      {label} {formatDate(d)} {formatTime(d)} <ArrowRight className="ml-auto size-4" />
    </Link>
  );
}

/** Индивидуальный урок: «Проведён» или «Не пришёл» (неуважительный). Уважительный пропуск — через «Отменить урок». */
function IndividualMark({ lesson }: { lesson: LessonDetail }) {
  const [pending, startTransition] = useTransition();
  const student = lesson.students[0];
  const current = lesson.status === "DONE" ? student?.attendance : null;
  if (!student && lesson.isTrial) return <TrialMark lesson={lesson} />;
  if (!student) return <p className="text-sm text-text-secondary">У урока нет ученика.</p>;

  const mark = (status: AttendanceStatus) =>
    startTransition(async () => {
      const r = await settleLessonAction(lesson.id, { kind: "DONE", attendance: { [student.clientId]: status } });
      if (r.ok) toast.success(r.message ?? "Сохранено");
      else toast.error(r.error ?? "Не удалось сохранить");
    });

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant={current === "PRESENT" ? "default" : "outline"}
        className={cn(current === "PRESENT" && "bg-done hover:bg-done/90")}
        disabled={pending}
        onClick={() => mark("PRESENT")}
      >
        Проведён
      </Button>
      <Button
        variant={current === "ABSENT_UNEXCUSED" ? "default" : "outline"}
        className={cn(current === "ABSENT_UNEXCUSED" && "bg-danger hover:bg-danger/90")}
        disabled={pending}
        onClick={() => mark("ABSENT_UNEXCUSED")}
      >
        Не пришёл (неув.)
      </Button>
    </div>
  );
}

/** Пробный урок лида: ученика-клиента ещё нет — отмечаем только факт проведения. Для ученика бесплатно, педагогу — фикс. */
function TrialMark({ lesson }: { lesson: LessonDetail }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        className={cn("w-full", lesson.status === "DONE" && "bg-done hover:bg-done/90")}
        variant={lesson.status === "DONE" ? "default" : "outline"}
        disabled={pending || lesson.status === "DONE"}
        onClick={() =>
          startTransition(async () => {
            const r = await settleLessonAction(lesson.id, { kind: "DONE", attendance: {} });
            if (r.ok) toast.success("Пробный урок отмечен");
            else toast.error(r.error ?? "Не удалось сохранить");
          })
        }
      >
        {lesson.status === "DONE" ? "Пробный проведён" : "Пробный урок проведён"}
      </Button>
      {lesson.leadId && (
        <Link href={`/leads?lead=${lesson.leadId}`} className="block text-sm text-brand-text hover:underline">
          Открыть лида →
        </Link>
      )}
      <p className="text-xs text-text-secondary">Для ученика бесплатно. Если не пришёл — «Отменить урок».</p>
    </div>
  );
}

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: "PRESENT", label: "Был", active: "bg-done-soft text-done border-done/40" },
  { value: "ABSENT_EXCUSED", label: "Ув.", active: "bg-warning-soft text-warning border-warning/40" },
  { value: "ABSENT_UNEXCUSED", label: "Неув.", active: "bg-danger-soft text-danger border-danger/40" },
];

function GroupAttendance({ lesson }: { lesson: LessonDetail }) {
  const [state, setState] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(lesson.students.map((s) => [s.clientId, (lesson.status === "DONE" && s.attendance) || "PRESENT"])),
  );
  const [pending, startTransition] = useTransition();
  if (!lesson.students.length) return <p className="text-sm text-text-secondary">В группе нет учеников на дату урока.</p>;

  const save = () =>
    startTransition(async () => {
      const r = await settleLessonAction(lesson.id, { kind: "DONE", attendance: state });
      if (r.ok) toast.success(r.message ?? "Сохранено");
      else toast.error(r.error ?? "Не удалось сохранить");
    });
  const present = Object.values(state).filter((s) => s === "PRESENT").length;

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {lesson.students.map((s) => (
          <li key={s.clientId} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 truncate text-sm">{s.fullName}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={`Посещаемость: ${s.fullName}`}>
              {ATTENDANCE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={state[s.clientId] === o.value}
                  onClick={() => setState({ ...state, [s.clientId]: o.value })}
                  className={cn(
                    "h-7 rounded-sm border px-2 text-xs font-medium text-text-secondary",
                    state[s.clientId] === o.value ? o.active : "bg-surface hover:bg-subtle",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Button className="w-full" disabled={pending} onClick={save}>
        {pending && <Loader2Icon className="animate-spin" />}
        {lesson.status === "DONE" ? "Сохранить посещаемость" : "Отметить урок"} · присутствуют {present} из {lesson.students.length}
      </Button>
    </div>
  );
}

function NotesForm({ lesson, canEditLink }: { lesson: LessonDetail; canEditLink: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      action={(fd) =>
        startTransition(async () => {
          const r = await updateNotesAction(lesson.id, {
            topic: String(fd.get("topic") ?? ""),
            homework: String(fd.get("homework") ?? ""),
            comment: String(fd.get("comment") ?? ""),
            ...(canEditLink ? { onlineUrl: String(fd.get("onlineUrl") ?? "") } : {}),
          });
          if (r.ok) toast.success(r.message ?? "Сохранено");
          else toast.error(r.error ?? "Не удалось сохранить");
        })
      }
    >
      <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">Тема и домашнее задание</h3>
      <div className="space-y-1.5">
        <Label htmlFor="topic">Тема</Label>
        <Input id="topic" name="topic" defaultValue={lesson.topic ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="homework">Домашнее задание</Label>
        <Textarea id="homework" name="homework" rows={2} defaultValue={lesson.homework ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="comment">Комментарий</Label>
        <Textarea id="comment" name="comment" rows={2} defaultValue={lesson.comment ?? ""} />
      </div>
      {canEditLink && (
        <div className="space-y-1.5">
          <Label htmlFor="onlineUrl">Ссылка на занятие</Label>
          <Input id="onlineUrl" name="onlineUrl" type="url" defaultValue={lesson.onlineUrl ?? ""} />
        </div>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Сохранить
      </Button>
    </form>
  );
}

function FinanceBlock({ finance }: { finance: NonNullable<LessonDetail["finance"]> }) {
  return (
    <Section title={finance.estimated ? "Финансы урока · оценка" : "Финансы урока"}>
      <div className="rounded-lg border text-sm">
        <ul className="divide-y">
          {finance.students.map((s) => (
            <li key={s.clientId} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 truncate">{s.fullName}</span>
              <span className="text-xs text-text-secondary">{PAYMENT_MODE_LABEL[s.paymentMode as "MONTHLY" | "PER_LESSON"]}</span>
              <span className="w-20 text-right tabular-nums">{s.charged ? formatRub(s.price) : "—"}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t bg-subtle/60 px-3 py-2">
          <Row label="Стоимость для учеников" value={formatRub(finance.revenue)} />
          <Row label={`Педагогу (${finance.accrualBasis})`} value={formatRub(finance.accrual)} />
          <Row label="Маржа" value={formatRub(finance.margin)} strong />
        </dl>
      </div>
      {finance.estimated && (
        <p className="text-xs text-text-secondary">Урок не отмечен — расчёт как если бы все пришли. Без надбавки за объём.</p>
      )}
    </Section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

