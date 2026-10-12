"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ListFilter, Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { CreateLessonSheet, type CreateLessonDefaults } from "@/components/lessons/create-lesson-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addDays,
  isoWeekday,
  localDateOf,
  parseLocalDate,
  shiftView,
  type CalendarView,
  type LocalDate,
} from "@/domain/calendar";
import { formatDayMonth, formatLocalDate, monthName, weekdayShort } from "@/domain/format";
import { LESSON_STATUS, type LessonDisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-mobile";
import type { CalendarLesson, LessonDetail, LessonFormOptions } from "@/server/lessons/queries";
import { Agenda, DayStrip } from "./agenda";
import { LessonList } from "./lesson-list";
import { LessonSheet } from "./lesson-sheet";
import { MonthGrid } from "./month-grid";
import { MoveDialog } from "./move-dialog";
import { TimeGrid, type GridColumn } from "./time-grid";
import { useUrlState } from "./url";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "list", label: "Список" },
];

const WEEKDAY_LONG = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export interface LessonsViewProps {
  view: CalendarView;
  date: LocalDate;
  range: { from: LocalDate; to: LocalDate };
  today: LocalDate;
  nowIso: string;
  lessons: CalendarLesson[];
  detail: LessonDetail | null;
  options: LessonFormOptions;
  role: "OWNER" | "ADMIN" | "TEACHER";
  perms: { canCreate: boolean; canMark: boolean; canManage: boolean };
  filters: { teacher?: string; subject?: string; client?: string; group?: string; status?: string };
  createOpen: boolean;
  mobileHint: boolean; // по User-Agent — чтобы телефон сразу получил мобильную разметку
}

function daysOf(from: LocalDate, to: LocalDate) {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function LessonsView(p: LessonsViewProps) {
  const { href, set } = useUrlState();
  const [create, setCreate] = useState<{ open: boolean; defaults: CreateLessonDefaults }>({
    open: p.createOpen && p.perms.canCreate,
    defaults: { date: p.date >= p.today ? p.date : p.today },
  });
  const isTeacher = p.role === "TEACHER";
  const mobile = useIsMobile(p.mobileHint);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Перетаскивание урока в сетке открывает диалог переноса с новыми датой, временем и педагогом.
  const [drop, setDrop] = useState<{ lesson: CalendarLesson; date: LocalDate; time: string; teacherId: string } | null>(null);
  const openLesson = (l: { id: string }) => set({ lesson: l.id });
  const openCreate = (defaults: Partial<CreateLessonDefaults> = {}) =>
    setCreate({ open: true, defaults: { date: p.date >= p.today ? p.date : p.today, teacherId: p.filters.teacher, ...defaults } });

  // Колонки сетки: «День» — по педагогам, «Неделя» — по дням.
  let columns: GridColumn[] = [];
  if (p.view === "day") {
    const teachers = p.options.teachers.filter((t) => !p.filters.teacher || t.id === p.filters.teacher);
    columns = teachers.map((t) => ({
      key: t.id,
      teacherId: t.id,
      date: p.date,
      label: (
        <span className="inline-flex items-center gap-1.5 truncate">
          <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
          {t.fullName}
        </span>
      ),
      lessons: p.lessons.filter((l) => l.teacherId === t.id),
    }));
  } else if (p.view === "week") {
    columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(p.range.from, i);
      return {
        key: d,
        date: d,
        highlight: d === p.today,
        label: (
          <button type="button" className="hover:underline" onClick={() => set({ view: "day", date: d })}>
            {weekdayShort(i + 1)}, {formatDayMonth(d)}
          </button>
        ),
        lessons: p.lessons.filter((l) => localDateOf(new Date(l.startsAt)) === d),
      };
    });
  }

  const { year, month } = parseLocalDate(p.date);
  const title =
    p.view === "day"
      ? `${WEEKDAY_LONG[isoWeekday(p.date) - 1]}, ${formatLocalDate(p.date)}`
      : p.view === "week"
        ? `${formatDayMonth(p.range.from)} – ${formatLocalDate(p.range.to)}`
        : `${monthName(month)[0].toUpperCase()}${monthName(month).slice(1)} ${year}`;

  const hasFilters = !!(p.filters.teacher || p.filters.subject || p.filters.client || p.filters.group || p.filters.status);

  return (
    <div className="space-y-4">
      {/* Вид и навигация по датам */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full rounded-lg border bg-surface p-0.5 md:w-auto" role="tablist" aria-label="Вид календаря">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={p.view === v.key}
              onClick={() => set({ view: v.key })}
              className={cn(
                "h-8 flex-1 rounded-md px-3 text-sm font-medium text-text-secondary hover:text-text-primary md:flex-none",
                p.view === v.key && "bg-brand-soft text-brand-text",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={() => set({ date: shiftView(p.view, p.date, -1) })}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" className="h-8" onClick={() => set({ date: p.today })}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" aria-label="Вперёд" onClick={() => set({ date: shiftView(p.view, p.date, 1) })}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="text-base font-semibold max-md:order-first max-md:w-full">{title}</h2>
        <Input
          type="date"
          aria-label="Перейти к дате"
          className="hidden h-8 w-36 md:block"
          value={p.date}
          onChange={(e) => e.target.value && set({ date: e.target.value })}
        />
        {p.perms.canCreate && (
          <Button className="ml-auto h-8" onClick={() => openCreate()}>
            <Plus /> Урок
          </Button>
        )}
        {mobile && (
          <Button
            variant="outline"
            className={cn("h-8", !p.perms.canCreate && "ml-auto", hasFilters && "border-brand text-brand-text")}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <ListFilter /> Фильтры
          </Button>
        )}
      </div>

      {/* Фильтры (на телефоне — по кнопке) */}
      <div className={cn("flex flex-wrap items-center gap-2", mobile && !filtersOpen && "hidden", mobile && "[&>*]:max-md:w-[calc(50%-4px)]")}>
        {!isTeacher && (
          <FilterSelect
            label="Педагог"
            value={p.filters.teacher}
            onChange={(v) => set({ teacher: v })}
            options={p.options.teachers.map((t) => ({ value: t.id, label: t.fullName }))}
          />
        )}
        <FilterSelect
          label="Предмет"
          value={p.filters.subject}
          onChange={(v) => set({ subject: v })}
          options={p.options.subjects.map((s) => ({ value: s, label: s }))}
        />
        <div className="w-48">
          <SearchableSelect
            options={p.options.clients.map((c) => ({ value: c.id, label: c.fullName }))}
            value={p.filters.client ?? null}
            onChange={(v) => set({ client: v })}
            placeholder="Ученик"
          />
        </div>
        <FilterSelect
          label="Группа"
          value={p.filters.group}
          onChange={(v) => set({ group: v })}
          options={p.options.groups.map((g) => ({ value: g.id, label: g.name }))}
        />
        <FilterSelect
          label="Статус"
          value={p.filters.status}
          onChange={(v) => set({ status: v })}
          options={(Object.keys(LESSON_STATUS) as LessonDisplayStatus[]).map((k) => ({ value: k, label: LESSON_STATUS[k].label }))}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ teacher: null, subject: null, client: null, group: null, status: null })}
          >
            <X /> Сбросить
          </Button>
        )}
      </div>

      {mobile ? (
        <div className="space-y-3">
          {p.view === "day" && <DayStrip date={p.date} today={p.today} onPick={(d) => set({ date: d })} />}
          <Agenda
            lessons={p.lessons}
            days={p.view === "day" ? [p.date] : daysOf(p.range.from, p.range.to)}
            nowIso={p.nowIso}
            showTeacher={!isTeacher}
            onLessonClick={openLesson}
            onSwipe={(dir) => set({ date: shiftView(p.view === "list" ? "month" : p.view, p.date, dir) })}
            empty={hasFilters ? "По выбранным фильтрам уроков нет." : p.view === "day" ? "В этот день уроков нет." : "Уроков нет."}
          />
        </div>
      ) : p.view === "day" || p.view === "week" ? (
        <TimeGrid
          columns={columns}
          nowIso={p.nowIso}
          showTeacher={p.view === "week" && !isTeacher}
          onLessonClick={openLesson}
          onLessonDrop={
            p.perms.canManage
              ? (l, c, time) => setDrop({ lesson: l, date: c.date, time, teacherId: c.teacherId ?? l.teacherId })
              : undefined
          }
          onSlotClick={
            p.perms.canCreate ? (c, time) => openCreate({ date: c.date, time, teacherId: c.teacherId ?? p.filters.teacher }) : undefined
          }
        />
      ) : p.view === "month" ? (
        <MonthGrid
          from={p.range.from}
          to={p.range.to}
          month={month}
          today={p.today}
          lessons={p.lessons}
          onLessonClick={openLesson}
          onDayClick={(d) => set({ view: "day", date: d })}
        />
      ) : p.lessons.length ? (
        <LessonList lessons={p.lessons} showTeacher={!isTeacher} onLessonClick={openLesson} />
      ) : (
        <div className="rounded-lg border border-dashed bg-surface px-6 py-12 text-center text-sm text-text-secondary">
          {hasFilters ? "По выбранным фильтрам уроков нет." : "В этом месяце уроков нет."}
          {p.perms.canCreate && (
            <div className="mt-4">
              <Button variant="outline" onClick={() => openCreate()}>
                <Plus /> Создать урок
              </Button>
            </div>
          )}
        </div>
      )}

      {drop && (
        <MoveDialog
          key={`${drop.lesson.id}-${drop.date}-${drop.time}-${drop.teacherId}`}
          open
          onOpenChange={(o) => !o && setDrop(null)}
          lesson={{ id: drop.lesson.id, startsAt: drop.lesson.startsAt, teacher: { id: drop.lesson.teacherId } }}
          initial={{ date: drop.date, time: drop.time, teacherId: drop.teacherId }}
          title={drop.lesson.title}
          teachers={p.options.teachers}
        />
      )}
      <LessonSheet
        lesson={p.detail}
        perms={{ canMark: p.perms.canMark, canManage: p.perms.canManage }}
        teachers={p.options.teachers}
        onClose={() => set({ lesson: null })}
        hrefFor={(id, date) => href({ lesson: id, date })}
        today={p.today}
      />
      {p.perms.canCreate && (
        <CreateLessonSheet
          open={create.open}
          onOpenChange={(open) => {
            setCreate((c) => ({ ...c, open }));
            if (!open && p.createOpen) set({ create: null }, "replace");
          }}
          options={p.options}
          defaults={create.defaults}
          onCreated={(id) => id && set({ lesson: id, create: null })}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger className={cn("h-9 w-40", value && "border-brand text-brand-text")} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}: все</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


