"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { studentNameGenitive } from "@/domain/names";
import { saveClientAction, type ClientPayload } from "./actions";

export interface ClientFormValues {
  id?: string;
  fullName: string;
  gender: "MALE" | "FEMALE" | null;
  fullNameGen: string | null;
  grade: number | null;
  school: string | null;
  phone: string | null;
  program: "EXAM" | "SCHOOL";
  paymentMode: "MONTHLY" | "PER_LESSON";
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  goal: string | null;
  source: "SITE" | "AVITO" | "VK" | "REFERRAL" | "OTHER" | null;
  notes: string | null;
  parents: { id?: string; fullName: string; relation: string | null; phone: string }[];
}

export const EMPTY_CLIENT: ClientFormValues = {
  fullName: "",
  gender: null,
  fullNameGen: null,
  grade: null,
  school: null,
  phone: null,
  program: "EXAM",
  paymentMode: "MONTHLY",
  status: "ACTIVE",
  goal: null,
  source: null,
  notes: null,
  parents: [{ fullName: "", relation: "мама", phone: "" }],
};

const SOURCES = [
  ["SITE", "Сайт"],
  ["AVITO", "Авито"],
  ["VK", "ВКонтакте"],
  ["REFERRAL", "Сарафанное радио"],
  ["OTHER", "Другое"],
] as const;

export function ClientSheet({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ClientFormValues;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[520px]">
        <SheetHeader className="border-b">
          <SheetTitle>{initial.id ? "Редактировать ученика" : "Новый ученик"}</SheetTitle>
          <SheetDescription>Пол нужен, чтобы правильно склонять имя в сообщениях родителям.</SheetDescription>
        </SheetHeader>
        {open && <ClientForm key={initial.id ?? "new"} initial={initial} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ClientForm({ initial, onDone }: { initial: ClientFormValues; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<ClientFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ClientFormValues>(k: K, value: ClientFormValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const autoGen = v.fullName.trim().split(/\s+/).length >= 2 ? studentNameGenitive(v.fullName, v.gender) : "";

  function submit() {
    setError(null);
    startTransition(async () => {
      const payload: ClientPayload = { ...v, parents: v.parents };
      const r = await saveClientAction(initial.id ?? null, payload);
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        onDone();
        if (!initial.id && r.data) router.push(`/clients/${r.data.id}`);
      } else setError(r.error);
    });
  }

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex-1 space-y-4 p-4">
        <F label="Фамилия и имя ученика" id="c-name">
          <Input id="c-name" value={v.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Иванов Миша" required />
        </F>
        <div className="grid grid-cols-3 gap-3">
          <F label="Пол" id="c-gender">
            <Select value={v.gender ?? "none"} onValueChange={(x) => set("gender", x === "none" ? null : (x as "MALE"))}>
              <SelectTrigger id="c-gender" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Мужской</SelectItem>
                <SelectItem value="FEMALE">Женский</SelectItem>
                <SelectItem value="none">Не указан</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Класс" id="c-grade">
            <Input
              id="c-grade"
              type="number"
              min={1}
              max={11}
              value={v.grade ?? ""}
              onChange={(e) => set("grade", e.target.value ? Number(e.target.value) : null)}
            />
          </F>
          <F label="Телефон ученика" id="c-phone">
            <Input id="c-phone" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} />
          </F>
        </div>
        <F label="В сообщениях: «у …» (родительный падеж)" id="c-gen">
          <Input id="c-gen" value={v.fullNameGen ?? ""} placeholder={autoGen || "Миши Иванова"} onChange={(e) => set("fullNameGen", e.target.value || null)} />
          <p className="text-xs text-text-secondary">Оставьте пустым — склонится автоматически{autoGen && `: «${autoGen}»`}.</p>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Программа" id="c-program">
            <Select value={v.program} onValueChange={(x) => set("program", x as "EXAM")}>
              <SelectTrigger id="c-program" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXAM">ОГЭ / ЕГЭ</SelectItem>
                <SelectItem value="SCHOOL">Школьная программа</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Оплата" id="c-mode">
            <Select value={v.paymentMode} onValueChange={(x) => set("paymentMode", x as "MONTHLY")}>
              <SelectTrigger id="c-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Абонемент на месяц</SelectItem>
                <SelectItem value="PER_LESSON">Поурочно</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Школа" id="c-school">
            <Input id="c-school" value={v.school ?? ""} onChange={(e) => set("school", e.target.value || null)} />
          </F>
          <F label="Откуда узнали" id="c-source">
            <Select value={v.source ?? "none"} onValueChange={(x) => set("source", x === "none" ? null : (x as "SITE"))}>
              <SelectTrigger id="c-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
                <SelectItem value="none">Не указано</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </div>
        <F label="Цель обучения" id="c-goal">
          <Input id="c-goal" value={v.goal ?? ""} onChange={(e) => set("goal", e.target.value || null)} placeholder="ЕГЭ профиль, 80+" />
        </F>
        {initial.id && (
          <F label="Статус" id="c-status">
            <Select value={v.status} onValueChange={(x) => set("status", x as "ACTIVE")}>
              <SelectTrigger id="c-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Активен</SelectItem>
                <SelectItem value="PAUSED">Пауза</SelectItem>
                <SelectItem value="ARCHIVED">Архив</SelectItem>
              </SelectContent>
            </Select>
          </F>
        )}

        <div className="space-y-3 rounded-lg border bg-subtle/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Родители</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => set("parents", [...v.parents, { fullName: "", relation: "", phone: "" }])}>
              <Plus /> Добавить
            </Button>
          </div>
          {v.parents.map((p, i) => (
            <div key={p.id ?? i} className="space-y-2 rounded-md border bg-surface p-3">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                {i === 0 ? "Основной контакт — ему приходят сообщения" : "Дополнительный контакт"}
                {v.parents.length > 1 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить родителя" onClick={() => set("parents", v.parents.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <Input
                aria-label="ФИО родителя"
                placeholder="Иванова Ольга Петровна"
                value={p.fullName}
                onChange={(e) => set("parents", v.parents.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))}
              />
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <Input
                  aria-label="Кем приходится"
                  placeholder="мама"
                  value={p.relation ?? ""}
                  onChange={(e) => set("parents", v.parents.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))}
                />
                <Input
                  aria-label="Телефон родителя"
                  placeholder="+7 914 000-00-00"
                  value={p.phone}
                  onChange={(e) => set("parents", v.parents.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                />
              </div>
            </div>
          ))}
        </div>

        <F label="Заметки" id="c-notes">
          <Textarea id="c-notes" rows={3} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
        </F>
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {initial.id ? "Сохранить" : "Добавить ученика"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
