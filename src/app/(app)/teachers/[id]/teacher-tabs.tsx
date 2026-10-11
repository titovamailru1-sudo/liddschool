"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Copy, KeyRound, Loader2Icon, Pencil } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLocalDate, formatRub } from "@/domain/format";
import type { TeacherCardData } from "@/server/payroll/queries";
import type { PlanView } from "@/server/payroll/rates";
import { assignPlanAction, teacherInviteAction } from "../actions";
import { TeacherSheet } from "../teacher-sheet";

export function MonthLinks({ base, label, prev, next }: { base: string; label: string; prev: string; next: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" asChild aria-label="Предыдущий месяц">
        <Link href={`${base}&month=${prev}`} scroll={false}>
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-36 text-center font-semibold capitalize">{label}</span>
      <Button variant="outline" size="icon" asChild aria-label="Следующий месяц">
        <Link href={`${base}&month=${next}`} scroll={false}>
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}

const LOGIN = {
  active: { label: "Входит в CRM", tone: "done" },
  invited: { label: "Приглашён, пароль не задан", tone: "warning" },
  none: { label: "Нет доступа в CRM", tone: "cancelled" },
} as const;

export function TeacherProfile({ card, canEdit }: { card: TeacherCardData; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = () =>
    startTransition(async () => {
      const r = await teacherInviteAction(card.id, email || undefined);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Ссылка готова");
      setLink(r.data?.link ?? null);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2 rounded-lg border bg-surface p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Профиль</h2>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
              <Pencil /> Редактировать
            </Button>
          )}
        </div>
        <Row label="Телефон" value={card.phone ?? "—"} />
        <Row label="Предметы" value={card.subjects.join(", ") || "—"} />
        <Row label="Ссылка на занятие" value={card.onlineUrl ?? "—"} />
        <div className="flex justify-between gap-4">
          <span className="text-text-secondary">Цвет в расписании</span>
          <span className="size-4 rounded-full" style={{ background: card.color }} />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-surface p-4 text-sm">
        <h2 className="font-semibold">Вход в CRM</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={LOGIN[card.login].tone}>{LOGIN[card.login].label}</StatusBadge>
          {card.email && <span className="text-text-secondary">{card.email}</span>}
        </div>
        {canEdit && (
          <div className="space-y-2">
            {card.login === "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email педагога — будет логином</Label>
                <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@lidd.school" />
              </div>
            )}
            <Button variant="outline" size="sm" disabled={pending || (card.login === "none" && !email)} onClick={invite}>
              {pending ? <Loader2Icon className="animate-spin" /> : <KeyRound />}
              {card.login === "none" ? "Создать доступ и ссылку" : card.login === "invited" ? "Новая ссылка-приглашение" : "Ссылка для смены пароля"}
            </Button>
            {link && (
              <div className="flex items-center gap-2 rounded-md border bg-subtle px-2 py-1.5">
                <code className="flex-1 truncate text-xs">{link}</code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Копировать ссылку"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    toast.success("Ссылка скопирована — отправьте её педагогу");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            )}
            <p className="text-xs text-text-secondary">Ссылка действует 7 дней и открывается один раз.</p>
          </div>
        )}
      </section>

      {canEdit && (
        <TeacherSheet
          open={edit}
          onOpenChange={setEdit}
          initial={{
            id: card.id,
            fullName: card.fullName,
            phone: card.phone ?? "",
            email: card.email ?? "",
            color: card.color,
            subjects: card.subjects.join(", "),
            onlineUrl: card.onlineUrl ?? "",
            isActive: card.isActive,
            hasLogin: card.login !== "none",
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

type History = {
  validFrom: string;
  planId: string;
  name: string;
  baseAmount: number;
  groupPerStudent: number;
  trialFixed: number;
  payForUnexcused: boolean;
  bonusApply: "WHOLE_MONTH" | "ABOVE_THRESHOLD";
  tiers: { thresholdHours: number; bonusPercent: number }[];
}[];

export function PlanSummary({ p }: { p: Omit<History[number], "validFrom" | "planId"> }) {
  return (
    <ul className="space-y-1 text-sm">
      <li>
        <b>{formatRub(p.baseAmount)}</b> за урок-час
      </li>
      <li>+{formatRub(p.groupPerStudent)} за каждого присутствующего в группе</li>
      <li>Пробный урок — {formatRub(p.trialFixed)}</li>
      <li>
        Надбавка за объём:{" "}
        {p.tiers.length ? p.tiers.map((t) => `от ${t.thresholdHours} ч +${t.bonusPercent}%`).join(", ") : "нет"}
        {p.tiers.length > 0 && (p.bonusApply === "WHOLE_MONTH" ? " — ко всей сумме месяца" : " — только к часам сверх порога")}
      </li>
      <li>Неуважительный пропуск ученика: {p.payForUnexcused ? "оплачивается" : "не оплачивается"}</li>
    </ul>
  );
}

export function TeacherRate({
  teacherId,
  history,
  plans,
  minFrom,
  today,
}: {
  teacherId: string;
  history: History;
  plans: PlanView[];
  minFrom: string;
  today: string;
}) {
  const current = history.find((h) => h.validFrom <= today) ?? history.at(-1);
  const upcoming = history.filter((h) => h.validFrom > today);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [from, setFrom] = useState(minFrom.slice(0, 7));
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border bg-surface p-4">
        <h2 className="text-sm font-semibold">Действует сейчас{current ? `: «${current.name}»` : ""}</h2>
        {current ? <PlanSummary p={current} /> : <p className="text-sm text-text-secondary">Ставка не назначена — используется шаблон школы.</p>}
        {upcoming.map((u) => (
          <div key={u.validFrom} className="rounded-md border border-planned/30 bg-planned-soft p-3 text-sm">
            <div className="mb-1 font-medium text-planned">С {formatLocalDate(u.validFrom)} — «{u.name}»</div>
            <PlanSummary p={u} />
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border bg-surface p-4 text-sm">
        <h2 className="font-semibold">Назначить другую ставку</h2>
        <p className="text-text-secondary">Ставка меняется только с 1-го числа месяца — текущий месяц считается по прежней.</p>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="assign-plan">Шаблон</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="assign-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {formatRub(p.baseAmount)}/ч
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-from">С месяца</Label>
            <Input id="assign-from" type="month" min={minFrom.slice(0, 7)} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>
        <Button
          disabled={pending || !planId || !from}
          onClick={() =>
            startTransition(async () => {
              const r = await assignPlanAction(teacherId, planId, `${from}-01`);
              if (r.ok) toast.success(r.message ?? "Назначено");
              else toast.error(r.error);
            })
          }
        >
          {pending && <Loader2Icon className="animate-spin" />}
          Назначить
        </Button>
        <Link href="/teachers/rates" className="block text-brand-text hover:underline">
          Изменить шаблоны ставок →
        </Link>

        {history.length > 0 && (
          <div className="border-t pt-3">
            <h3 className="mb-2 font-medium">История</h3>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.validFrom} className="flex justify-between gap-3">
                  <span>с {formatLocalDate(h.validFrom)}</span>
                  <span className="text-text-secondary">
                    «{h.name}», {formatRub(h.baseAmount)}/ч
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
