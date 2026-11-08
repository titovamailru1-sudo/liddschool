"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requestTrialAction, type TrialRequest } from "./actions";
import { reachGoal } from "./metrika";

type Subject = TrialRequest["subject"];

export function TrialForm() {
  const [startedAt] = useState(() => Date.now());
  const [v, setV] = useState({ childName: "", grade: "", subject: "математика" as Subject, program: "EXAM" as "EXAM" | "SCHOOL", parentName: "", phone: "", preferredTime: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v, value: string) => setV((x) => ({ ...x, [k]: value }));

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-xl border bg-surface px-6 py-12 text-center" role="status">
        <CheckCircle2 className="mb-3 size-10 text-done" />
        <h3 className="text-lg font-semibold">Заявка отправлена</h3>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">Мы свяжемся с вами в ближайшее время, чтобы подобрать удобное время пробного урока.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-xl border bg-surface p-5 sm:p-6"
      aria-label="Заявка на пробный урок"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await requestTrialAction({
            ...v,
            grade: v.grade ? Number(v.grade) : null,
            parentName: v.parentName || undefined,
            preferredTime: v.preferredTime || undefined,
            consent: consent as true,
            startedAt,
          });
          if (r.ok) {
            reachGoal("trial_request");
            setDone(true);
          } else setError(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Имя ребёнка" id="t-child">
          <Input id="t-child" value={v.childName} onChange={(e) => set("childName", e.target.value)} autoComplete="off" required />
        </Field>
        <Field label="Класс" id="t-grade">
          <Select value={v.grade} onValueChange={(x) => set("grade", x)}>
            <SelectTrigger id="t-grade" className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 11 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Предмет" id="t-subject">
          <Select value={v.subject} onValueChange={(x) => set("subject", x)}>
            <SelectTrigger id="t-subject" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="математика">Математика</SelectItem>
              <SelectItem value="информатика">Информатика</SelectItem>
              <SelectItem value="математика и информатика">Оба предмета</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Цель" id="t-program">
          <Select value={v.program} onValueChange={(x) => set("program", x)}>
            <SelectTrigger id="t-program" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXAM">Подготовка к ОГЭ / ЕГЭ</SelectItem>
              <SelectItem value="SCHOOL">Школьная программа</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ваше имя" id="t-parent">
          <Input id="t-parent" value={v.parentName} onChange={(e) => set("parentName", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Телефон" id="t-phone">
          <Input id="t-phone" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+7 900 000-00-00" autoComplete="tel" required />
        </Field>
      </div>
      <Field label="Когда удобно заниматься (необязательно)" id="t-time">
        <Input id="t-time" value={v.preferredTime} onChange={(e) => set("preferredTime", e.target.value)} placeholder="Будни после 16:00" />
      </Field>
      {/* Ловушка для ботов: людям поле не видно. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={v.website} onChange={(e) => set("website", e.target.value)} />
      <label className="flex items-start gap-2.5 text-sm text-text-secondary">
        <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} aria-label="Согласие на обработку персональных данных" className="mt-0.5" />
        <span>
          Согласен(на) на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" className="text-brand-text underline underline-offset-2">
            политикой конфиденциальности
          </Link>
        </span>
      </label>
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !consent}>
        {pending && <Loader2Icon className="animate-spin" />}
        Записаться на бесплатный урок
      </Button>
    </form>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
