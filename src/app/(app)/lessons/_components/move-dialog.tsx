"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConflictList } from "@/components/lessons/conflict-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateOf } from "@/domain/calendar";
import { formatTime } from "@/domain/format";
import type { LessonDetail } from "@/server/lessons/queries";
import type { ConflictView } from "@/server/lessons/service";
import { moveLessonAction } from "../actions";

export function MoveDialog({
  open,
  onOpenChange,
  lesson,
  teachers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson: LessonDetail;
  teachers: { id: string; fullName: string }[];
}) {
  const startsAt = new Date(lesson.startsAt);
  const [date, setDate] = useState(localDateOf(startsAt));
  const [time, setTime] = useState(formatTime(startsAt));
  const [teacherId, setTeacherId] = useState(lesson.teacher.id);
  const [conflicts, setConflicts] = useState<ConflictView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocking = conflicts.some((c) => c.kind === "teacher");

  function submit(force: boolean) {
    startTransition(async () => {
      const r = await moveLessonAction(lesson.id, { date, time, teacherId, force });
      if (r.ok) {
        toast.success(r.message ?? "Урок перенесён");
        onOpenChange(false);
      } else if (r.conflicts) {
        setConflicts(r.conflicts);
      } else {
        setError(r.error ?? "Не удалось перенести");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Перенести урок</DialogTitle>
          <DialogDescription>Исходный урок останется в истории со статусом «Перенесён».</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setConflicts([]);
            setError(null);
            submit(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="move-date">Дата</Label>
              <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="move-time">Время</Label>
              <Input id="move-time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move-teacher">Педагог</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger id="move-teacher" className="w-full">
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
          <ConflictList conflicts={conflicts} />
          {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            {conflicts.length > 0 && !blocking ? (
              <Button type="button" disabled={pending} onClick={() => submit(true)}>
                Перенести всё равно
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                Перенести
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
