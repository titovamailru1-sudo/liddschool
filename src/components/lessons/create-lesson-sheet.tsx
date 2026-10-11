"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { createLessonAction, previewCreateAction, type CreateLessonPayload } from "@/app/(app)/lessons/actions";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isoWeekday } from "@/domain/calendar";
import { WEEKDAYS_SHORT } from "@/domain/format";
import { PAYMENT_MODE_LABEL } from "@/lib/status";
import type { LessonFormOptions } from "@/server/lessons/queries";
import type { ConflictView } from "@/server/lessons/service";
import { ConflictList } from "./conflict-list";

export interface CreateLessonDefaults {
  date: string;
  time?: string;
  teacherId?: string;
  clientId?: string;
  groupId?: string;
  weekly?: boolean;
}

const DURATIONS = [45, 60, 90, 120];

export function CreateLessonSheet({
  open,
  onOpenChange,
  options,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: LessonFormOptions;
  defaults: CreateLessonDefaults;
  onCreated?: (lessonId?: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle>Новый урок</SheetTitle>
          <SheetDescription>Разовый урок или регулярное расписание. Все уроки — онлайн.</SheetDescription>
        </SheetHeader>
        {/* key: при каждом открытии форма начинается с новых значений по умолчанию */}
        {open && (
          <CreateLessonForm
            key={JSON.stringify(defaults)}
            options={options}
            defaults={defaults}
            onDone={(id) => {
              onOpenChange(false);
              onCreated?.(id);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CreateLessonForm({
  options,
  defaults,
  onDone,
  onCancel,
}: {
  options: LessonFormOptions;
  defaults: CreateLessonDefaults;
  onDone: (lessonId?: string) => void;
  onCancel: () => void;
}) {
  const initialGroup = defaults.groupId ? options.groups.find((g) => g.id === defaults.groupId) : undefined;
  const [kind, setKind] = useState<"client" | "group">(initialGroup ? "group" : "client");
  const [clientId, setClientId] = useState<string | null>(defaults.clientId ?? null);
  const [groupId, setGroupId] = useState<string | null>(initialGroup?.id ?? null);
  const [teacherId, setTeacherId] = useState<string>(
    initialGroup?.teacherId ?? defaults.teacherId ?? (options.teachers.length === 1 ? options.teachers[0].id : ""),
  );
  const teacher = options.teachers.find((t) => t.id === teacherId);
  const [subject, setSubject] = useState<string>(initialGroup?.subject ?? teacher?.subjects[0]?.toLowerCase() ?? "математика");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time ?? "16:00");
  const [durationMin, setDuration] = useState(60);
  const [onlineUrl, setOnlineUrl] = useState(teacher?.onlineUrl ?? "");
  const [weekly, setWeekly] = useState(!!defaults.weekly);
  const [weekdays, setWeekdays] = useState<number[]>([isoWeekday(defaults.date)]);
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [until, setUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ count: number; conflicts: ConflictView[] } | null>(null);
  const [pending, startTransition] = useTransition();

  // Смена педагога подставляет его ссылку на занятие.
  function pickTeacher(id: string) {
    setTeacherId(id);
    const t = options.teachers.find((x) => x.id === id);
    if (t?.onlineUrl) setOnlineUrl(t.onlineUrl);
  }

  function pickGroup(id: string) {
    setGroupId(id);
    const g = options.groups.find((x) => x.id === id);
    if (g) {
      pickTeacher(g.teacherId);
      setSubject(g.subject);
    }
  }

  // Первый урок серии — в выбранный день; при смене даты день недели подставляется, если серия на один день.
  function pickDate(d: string) {
    setDate(d);
    if (d && weekdays.length <= 1) setWeekdays([isoWeekday(d)]);
  }

  const payload: CreateLessonPayload | null = useMemo(() => {
    if (!teacherId || !date || !time || (kind === "client" ? !clientId : !groupId)) return null;
    return {
      teacherId,
      clientId: kind === "client" ? clientId : null,
      groupId: kind === "group" ? groupId : null,
      subject,
      date,
      time,
      durationMin,
      onlineUrl: onlineUrl || null,
      repeat: weekly ? { kind: "weekly", weekdays, until: untilEnabled && until ? until : null } : { kind: "once" },
    };
  }, [teacherId, kind, clientId, groupId, subject, date, time, durationMin, onlineUrl, weekly, weekdays, untilEnabled, until]);

  // Предпросмотр: сколько уроков и пересечения — с задержкой, пока пользователь заполняет форму.
  useEffect(() => {
    if (!payload) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await previewCreateAction(payload);
      if (!stale) setPreview(r.ok ? { count: r.count, conflicts: r.conflicts } : null);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [payload]);

  const blocking = !!preview?.conflicts.some((c) => c.kind === "teacher");
  const needsConfirm = !blocking && !!preview?.conflicts.length;

  function submit(force: boolean) {
    if (!payload) {
      setError("Заполните ученика или группу, педагога, дату и время");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createLessonAction({ ...payload, force });
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onDone(r.id);
      } else if (r.conflicts) {
        setPreview({ count: preview?.count ?? 0, conflicts: r.conflicts });
      } else {
        setError(r.error ?? "Не удалось сохранить");
      }
    });
  }

  const clientOptions = options.clients.map((c) => ({ value: c.id, label: c.fullName, hint: PAYMENT_MODE_LABEL[c.paymentMode] }));
  const groupOptions = options.groups.map((g) => ({ value: g.id, label: g.name, hint: g.subject }));

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="flex-1 space-y-5 p-4">
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as "client" | "group")} className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="client" /> Индивидуально
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="group" /> Группа
          </label>
        </RadioGroup>

        <Field label={kind === "client" ? "Ученик" : "Группа"} htmlFor="target">
          {kind === "client" ? (
            <SearchableSelect id="target" options={clientOptions} value={clientId} onChange={setClientId} placeholder="Выберите ученика" />
          ) : (
            <SearchableSelect id="target" options={groupOptions} value={groupId} onChange={pickGroup} placeholder="Выберите группу" />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Педагог" htmlFor="teacher">
            <Select value={teacherId} onValueChange={pickTeacher}>
              <SelectTrigger id="teacher" className="w-full">
                <SelectValue placeholder="Педагог" />
              </SelectTrigger>
              <SelectContent>
                {options.teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="size-2 rounded-full" style={{ background: t.color }} />
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Предмет" htmlFor="subject">
            <Input id="subject" list="subjects" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            <datalist id="subjects">
              {options.subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label={weekly ? "Первый урок" : "Дата"} htmlFor="date">
            <Input id="date" type="date" value={date} onChange={(e) => pickDate(e.target.value)} required />
          </Field>
          <Field label="Время" htmlFor="time">
            <Input id="time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
          <Field label="Длительность" htmlFor="duration">
            <Select value={String(durationMin)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger id="duration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} мин
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Ссылка на занятие" htmlFor="url">
          <Input id="url" type="url" placeholder="https://…" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} />
        </Field>

        <div className="space-y-3 rounded-lg border bg-subtle/50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={weekly} onCheckedChange={(v) => setWeekly(v === true)} />
            Повторять каждую неделю
          </label>
          {weekly && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Дни недели">
                {WEEKDAYS_SHORT.map((label, i) => {
                  const wd = i + 1;
                  const on = weekdays.includes(wd);
                  return (
                    <button
                      key={wd}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== wd) : [...weekdays, wd].sort())}
                      className={
                        on
                          ? "h-8 w-10 rounded-md bg-brand text-sm font-medium text-white"
                          : "h-8 w-10 rounded-md border bg-surface text-sm text-text-secondary hover:bg-subtle"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={untilEnabled} onCheckedChange={(v) => setUntilEnabled(v === true)} />
                  Действует до
                </label>
                {untilEnabled ? (
                  <Input type="date" className="w-40" value={until} min={date} onChange={(e) => setUntil(e.target.value)} aria-label="Дата окончания" />
                ) : (
                  <span className="text-sm text-text-secondary">бессрочно</span>
                )}
              </div>
            </>
          )}
        </div>

        {preview && weekly && preview.count > 0 && (
          <p className="text-sm text-text-secondary">
            Будет создано уроков до конца следующего месяца: <b className="text-text-primary">{preview.count}</b>
            {!untilEnabled && ". Дальше уроки появятся автоматически."}
          </p>
        )}
        {preview && <ConflictList conflicts={preview.conflicts} />}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        {needsConfirm ? (
          <Button type="button" disabled={pending} onClick={() => submit(true)}>
            {pending && <Loader2Icon className="animate-spin" />}
            Сохранить всё равно
          </Button>
        ) : (
          <Button type="submit" disabled={pending || blocking}>
            {pending && <Loader2Icon className="animate-spin" />}
            {weekly ? "Создать расписание" : "Создать урок"}
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
