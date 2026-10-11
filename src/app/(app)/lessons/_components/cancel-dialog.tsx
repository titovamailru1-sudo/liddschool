"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { localDateOf, zonedInstant } from "@/domain/calendar";
import { classifyClientCancellation } from "@/domain/lessonSettlement";
import { formatTime } from "@/domain/format";
import type { LessonDetail } from "@/server/lessons/queries";
import { cancelLessonAction } from "../actions";

/**
 * Отмена урока. Школой — без последствий для денег. Учеником (только индивидуальный урок):
 * предупредил за 24 ч и раньше — уважительный пропуск, позже — неуважительный; администратор может изменить.
 */
export function CancelDialog({
  open,
  onOpenChange,
  lesson,
  onMoveInstead,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson: LessonDetail;
  onMoveInstead?: () => void;
}) {
  const [by, setBy] = useState<"SCHOOL" | "CLIENT">("SCHOOL");
  const [nowAt] = useState(() => new Date());
  const [notifiedDate, setNotifiedDate] = useState(localDateOf(nowAt));
  const [notifiedTime, setNotifiedTime] = useState(formatTime(nowAt));
  const [override, setOverride] = useState<"auto" | "excused" | "unexcused">("auto");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const notifiedAt = useMemo(() => {
    try {
      return zonedInstant(notifiedDate, notifiedTime);
    } catch {
      return null;
    }
  }, [notifiedDate, notifiedTime]);
  const auto = notifiedAt ? classifyClientCancellation(new Date(lesson.startsAt), notifiedAt) : "UNEXCUSED";
  const excused = override === "auto" ? auto === "EXCUSED" : override === "excused";

  function submit() {
    startTransition(async () => {
      const r = await cancelLessonAction(lesson.id, {
        by,
        notifiedAt: by === "CLIENT" && notifiedAt ? notifiedAt.toISOString() : undefined,
        excused: by === "CLIENT" ? excused : undefined,
        reason: reason || null,
      });
      if (r.ok) {
        toast.success(r.message ?? "Урок отменён");
        onOpenChange(false);
      } else toast.error(r.error ?? "Не удалось отменить");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отменить урок</DialogTitle>
          <DialogDescription>Отмену можно будет исправить: «Вернуть в расписание».</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={by} onValueChange={(v) => setBy(v as "SCHOOL" | "CLIENT")} className="gap-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="SCHOOL" /> Отменила школа (педагог заболел и т. п.)
            </label>
            {!lesson.isGroup && (
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="CLIENT" /> Отменил ученик
              </label>
            )}
          </RadioGroup>

          {by === "SCHOOL" && onMoveInstead && (
            <div className="rounded-lg border border-moved/30 bg-moved-soft p-3 text-sm">
              <p className="mb-2">Педагог проведёт урок в другой день? Оформите перенос — деньги не двигаются, урок остаётся оплаченным.</p>
              <Button type="button" variant="outline" size="sm" onClick={onMoveInstead}>
                Перенести на другой день вместо отмены
              </Button>
            </div>
          )}

          {by === "CLIENT" && (
            <div className="space-y-3 rounded-lg border bg-subtle/50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="n-date">Когда предупредили</Label>
                  <Input id="n-date" type="date" value={notifiedDate} onChange={(e) => setNotifiedDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="n-time">Время</Label>
                  <Input id="n-time" type="time" value={notifiedTime} onChange={(e) => setNotifiedTime(e.target.value)} />
                </div>
              </div>
              <RadioGroup value={override} onValueChange={(v) => setOverride(v as typeof override)} className="gap-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="auto" />
                  По правилу 24 ч: <b>{auto === "EXCUSED" ? "уважительный пропуск" : "неуважительный пропуск"}</b>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="excused" /> Считать уважительным
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="unexcused" /> Считать неуважительным
                </label>
              </RadioGroup>
              <p className="text-xs text-text-secondary">
                {excused
                  ? "Урок не списывается. Абонементщикам стоимость перенесётся на следующий месяц."
                  : "Урок считается проведённым: поурочнику списывается полностью, педагогу — по настройке ставки."}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">Причина</Label>
            <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Необязательно" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Назад
          </Button>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {pending && <Loader2Icon className="animate-spin" />}
            Отменить урок
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
