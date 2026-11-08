"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { saveGroupAction } from "./actions";

export interface GroupFormValues {
  id?: string;
  name: string;
  subject: string;
  program: "EXAM" | "SCHOOL";
  teacherId: string;
  maxStudents: number;
  isActive: boolean;
}

export const EMPTY_GROUP: GroupFormValues = { name: "", subject: "математика", program: "EXAM", teacherId: "", maxStudents: 8, isActive: true };

/** Создание и изменение группы — в выезжающей панели. */
export function GroupSheet({
  open,
  onOpenChange,
  initial,
  teachers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: GroupFormValues;
  teachers: { id: string; fullName: string; subjects: string[] }[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[460px]">
        <SheetHeader className="border-b">
          <SheetTitle>{initial.id ? "Изменить группу" : "Новая группа"}</SheetTitle>
          <SheetDescription>Расписание и учеников добавите в карточке группы.</SheetDescription>
        </SheetHeader>
        {open && <GroupForm key={initial.id ?? "new"} initial={initial} teachers={teachers} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function GroupForm({ initial, teachers, onDone }: { initial: GroupFormValues; teachers: { id: string; fullName: string; subjects: string[] }[]; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof GroupFormValues>(k: K, value: GroupFormValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const subjects = [...new Set(["математика", "информатика", ...teachers.flatMap((t) => t.subjects)])];

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const { id, ...payload } = v;
          const r = await saveGroupAction(id ?? null, payload);
          if (r.ok) {
            toast.success(r.message ?? "Сохранено");
            onDone();
            if (!id && r.data) router.push(`/groups/${r.data.id}`);
          } else setError(r.error);
        });
      }}
    >
      <div className="flex-1 space-y-4 p-4">
        <F label="Название" id="g-name">
          <Input id="g-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="ОГЭ-9Б" required />
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Предмет" id="g-subject">
            <Input id="g-subject" list="g-subjects" value={v.subject} onChange={(e) => set("subject", e.target.value)} required />
            <datalist id="g-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </F>
          <F label="Программа" id="g-program">
            <Select value={v.program} onValueChange={(x) => set("program", x as "EXAM")}>
              <SelectTrigger id="g-program" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXAM">ОГЭ / ЕГЭ</SelectItem>
                <SelectItem value="SCHOOL">Школьная программа</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <F label="Педагог" id="g-teacher">
            <Select value={v.teacherId} onValueChange={(x) => set("teacherId", x)}>
              <SelectTrigger id="g-teacher" className="w-full">
                <SelectValue placeholder="Выберите" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Максимум" id="g-max">
            <Input id="g-max" type="number" min={1} max={50} value={v.maxStudents} onChange={(e) => set("maxStudents", Number(e.target.value) || 1)} />
          </F>
        </div>
        <p className="text-xs text-text-secondary">Цена — по групповому тарифу школы; педагогу — ставка за урок-час и доплата за каждого присутствующего.</p>
        {initial.id && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!v.isActive} onCheckedChange={(c) => set("isActive", c !== true)} />
            Группа в архиве (не набирается и не показывается в списке)
          </label>
        )}
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending || !v.teacherId}>
          {pending && <Loader2Icon className="animate-spin" />}
          {initial.id ? "Сохранить" : "Создать группу"}
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
