"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { createTeacherAction, updateTeacherAction } from "./actions";

/** Цвета педагогов из палитры школы и несколько дополнительных. */
export const TEACHER_COLORS = ["#8A88EE", "#45B48C", "#EC9A62", "#E486AF", "#4A80D8", "#C98326", "#9373DF", "#2F9B6B"];

export interface TeacherFormValues {
  id?: string;
  fullName: string;
  phone: string;
  email: string;
  color: string;
  subjects: string;
  onlineUrl: string;
  isActive: boolean;
  hasLogin?: boolean;
}

export const EMPTY_TEACHER: TeacherFormValues = {
  fullName: "",
  phone: "",
  email: "",
  color: TEACHER_COLORS[0],
  subjects: "математика",
  onlineUrl: "",
  isActive: true,
};

export function TeacherSheet({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: TeacherFormValues }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle>{initial.id ? "Редактировать педагога" : "Новый педагог"}</SheetTitle>
          <SheetDescription>
            {initial.id ? "Изменения сразу видны в расписании." : "Ставка — по шаблону школы. Если указать email, появится ссылка для входа в CRM."}
          </SheetDescription>
        </SheetHeader>
        {open && <TeacherForm key={initial.id ?? "new"} initial={initial} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function TeacherForm({ initial, onDone }: { initial: TeacherFormValues; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TeacherFormValues>(k: K, val: TeacherFormValues[K]) => setV((x) => ({ ...x, [k]: val }));

  function submit() {
    setError(null);
    const payload = {
      fullName: v.fullName,
      phone: v.phone || null,
      email: v.email || null,
      color: v.color,
      subjects: v.subjects.split(",").map((s) => s.trim()).filter(Boolean),
      onlineUrl: v.onlineUrl || null,
    };
    startTransition(async () => {
      if (initial.id) {
        const r = await updateTeacherAction(initial.id, { ...payload, isActive: v.isActive });
        if (!r.ok) return setError(r.error);
        toast.success(r.message ?? "Сохранено");
        onDone();
        return;
      }
      const r = await createTeacherAction(payload);
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Педагог добавлен");
      if (r.data?.inviteLink) setInvite(r.data.inviteLink);
      else {
        onDone();
        router.push(`/teachers/${r.data?.id}`);
      }
    });
  }

  if (invite) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm">
          Педагог добавлен. Отправьте ему ссылку — по ней он задаст пароль и войдёт в CRM. Ссылка действует 7 дней и открывается один раз.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-subtle px-2 py-1.5">
          <code className="flex-1 truncate text-xs">{invite}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Копировать ссылку"
            onClick={() => {
              void navigator.clipboard.writeText(invite);
              toast.success("Ссылка скопирована");
            }}
          >
            <Copy />
          </Button>
        </div>
        <Button onClick={onDone}>Готово</Button>
      </div>
    );
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
        <F id="t-name" label="Фамилия и имя">
          <Input id="t-name" value={v.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Петрова Анна" required />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F id="t-phone" label="Телефон">
            <Input id="t-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+7 914 000-00-00" />
          </F>
          <F id="t-email" label={initial.hasLogin ? "Email (логин)" : "Email для входа"}>
            <Input id="t-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="name@lidd.school" />
          </F>
        </div>
        <F id="t-subjects" label="Предметы (через запятую)">
          <Input id="t-subjects" value={v.subjects} onChange={(e) => set("subjects", e.target.value)} placeholder="математика, ОГЭ" />
        </F>
        <F id="t-url" label="Постоянная ссылка на онлайн-занятие">
          <Input id="t-url" type="url" value={v.onlineUrl} onChange={(e) => set("onlineUrl", e.target.value)} placeholder="https://telemost.yandex.ru/j/…" />
        </F>
        <div className="space-y-1.5">
          <Label>Цвет в расписании</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет в расписании">
            {TEACHER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={v.color === c}
                aria-label={c}
                onClick={() => set("color", c)}
                className={cn("flex size-8 items-center justify-center rounded-full ring-offset-2", v.color === c && "ring-2 ring-ring")}
                style={{ background: c }}
              >
                {v.color === c && <Check className="size-4 text-white" />}
              </button>
            ))}
          </div>
        </div>
        {initial.id && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.isActive} onCheckedChange={(x) => set("isActive", x === true)} />
            Работает в школе (снимите, если педагог ушёл — вход в CRM закроется)
          </label>
        )}
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {initial.id ? "Сохранить" : "Добавить педагога"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function F({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
