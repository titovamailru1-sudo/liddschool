"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatLocalDate, formatRub, plural } from "@/domain/format";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { TariffListItem } from "@/server/billing/tariffs";
import { createTariffAction, deleteTariffAction, deleteTariffPriceAction, setTariffPriceAction, updateTariffAction } from "./actions";

type Kind = "INDIVIDUAL" | "GROUP";
type Program = "EXAM" | "SCHOOL";
type Mode = "MONTHLY" | "PER_LESSON";

const KIND_LABEL: Record<Kind, string> = { INDIVIDUAL: "Индивидуально", GROUP: "Группа" };

const rubles = (s: string) => s.replace(/[^\d]/g, "");

export function TariffsView({ tariffs, today, canManage }: { tariffs: TariffListItem[]; today: string; canManage: boolean }) {
  const [sheet, setSheet] = useState<{ tariff: TariffListItem | null } | null>(null);
  const school = tariffs.filter((t) => t.isDefault);
  const own = tariffs.filter((t) => !t.isDefault);
  // После сохранения список обновляется с сервера — в панели показываем свежую версию тарифа.
  const editing = sheet?.tariff ? (tariffs.find((t) => t.id === sheet.tariff!.id) ?? null) : null;

  return (
    <div className="space-y-6">
      <TariffTable title="Тарифы школы" rows={school} canManage={canManage} onEdit={(t) => setSheet({ tariff: t })} />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Свои тарифы</h2>
          {canManage && (
            <Button className="ml-auto" onClick={() => setSheet({ tariff: null })}>
              <Plus /> Тариф
            </Button>
          )}
        </div>
        {own.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Своих тарифов пока нет"
            hint={
              canManage
                ? "Создайте тариф — например, льготный или для брата и сестры — и выберите его в карточке ученика."
                : "Свои тарифы (льготные и т. п.) создаёт владелец школы."
            }
          />
        ) : (
          <TariffTable rows={own} canManage={canManage} onEdit={(t) => setSheet({ tariff: t })} />
        )}
      </div>
      {canManage && (
        <TariffSheet
          open={!!sheet}
          onOpenChange={(o) => !o && setSheet(null)}
          tariff={sheet?.tariff ? editing : null}
          today={today}
          key={sheet?.tariff?.id ?? "new"}
        />
      )}
    </div>
  );
}

function TariffTable({
  title,
  rows,
  canManage,
  onEdit,
}: {
  title?: string;
  rows: TariffListItem[];
  canManage: boolean;
  onEdit: (t: TariffListItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-surface">
      {title && <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-medium">Название</th>
              <th className="px-4 py-2.5 font-medium">Применяется</th>
              <th className="px-4 py-2.5 text-right font-medium">За урок-час</th>
              <th className="px-4 py-2.5 font-medium">Изменение цены</th>
              <th className="px-4 py-2.5 text-right font-medium">Учеников</th>
              {canManage && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2.5 font-medium">{t.name}</td>
                <td className="px-4 py-2.5 text-text-secondary">
                  {KIND_LABEL[t.kind]} · {PROGRAM_LABEL[t.program]} · {PAYMENT_MODE_LABEL[t.paymentMode].toLowerCase()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{t.current ? formatRub(t.current.pricePerHour) : "—"}</td>
                <td className="px-4 py-2.5 text-text-secondary">
                  {t.upcoming.map((p) => `${formatRub(p.pricePerHour)} с ${formatLocalDate(p.validFrom)}`).join("; ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{t.isDefault ? <span className="text-text-secondary">по умолчанию</span> : t.clients}</td>
                {canManage && (
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Изменить тариф ${t.name}`} onClick={() => onEdit(t)}>
                        <Pencil />
                      </Button>
                      {!t.isDefault && <DeleteTariff tariff={t} />}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeleteTariff({ tariff }: { tariff: TariffListItem }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const blocked = tariff.clients > 0;
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Удалить тариф ${tariff.name}`} onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить тариф «{tariff.name}»?</DialogTitle>
            <DialogDescription>
              {blocked
                ? `Тариф назначен ${tariff.clients} ${plural(tariff.clients, ["ученику", "ученикам", "ученикам"])}. Сначала выберите им другой тариф в карточке.`
                : "Уже выставленные счета и проведённые уроки не изменятся."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Назад
            </Button>
            <Button
              variant="destructive"
              disabled={pending || blocked}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteTariffAction(tariff.id);
                  if (r.ok) {
                    toast.success(r.message ?? "Удалено");
                    setOpen(false);
                  } else toast.error(r.error);
                })
              }
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TariffSheet({
  open,
  onOpenChange,
  tariff,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tariff: TariffListItem | null;
  today: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle>{tariff ? "Тариф" : "Новый тариф"}</SheetTitle>
          <SheetDescription>Новая цена действует с выбранной даты; проведённые уроки и выставленные счета не пересчитываются.</SheetDescription>
        </SheetHeader>
        {open && <TariffForm tariff={tariff} today={today} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function TariffForm({ tariff, today, onDone }: { tariff: TariffListItem | null; today: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(tariff?.name ?? "");
  const [kind, setKind] = useState<Kind>(tariff?.kind ?? "INDIVIDUAL");
  const [program, setProgram] = useState<Program>(tariff?.program ?? "EXAM");
  const [mode, setMode] = useState<Mode>(tariff?.paymentMode ?? "MONTHLY");
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState(today);
  const [pending, startTransition] = useTransition();
  const locked = !!tariff && (tariff.isDefault || tariff.clients > 0);

  function save() {
    startTransition(async () => {
      const attrs = { name, kind, program, paymentMode: mode };
      const r = tariff ? await updateTariffAction(tariff.id, attrs) : await createTariffAction({ ...attrs, pricePerHour: Number(price), validFrom: from });
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        router.refresh();
        if (!tariff) onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">Название</Label>
          <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Льготный ЕГЭ" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Формат" id="t-kind">
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)} disabled={locked}>
              <SelectTrigger id="t-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INDIVIDUAL">Индивидуально</SelectItem>
                <SelectItem value="GROUP">Группа</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Программа" id="t-program">
            <Select value={program} onValueChange={(v) => setProgram(v as Program)} disabled={locked}>
              <SelectTrigger id="t-program" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXAM">ОГЭ / ЕГЭ</SelectItem>
                <SelectItem value="SCHOOL">Школьная</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Оплата" id="t-mode">
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={locked}>
              <SelectTrigger id="t-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Абонемент</SelectItem>
                <SelectItem value="PER_LESSON">Поурочно</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {locked && (
          <p className="text-xs text-text-secondary">
            {tariff!.isDefault
              ? "У тарифа школы меняются только название и цена."
              : "Тариф назначен ученикам — формат, программу и оплату изменить нельзя."}
          </p>
        )}
        {!tariff && kind === "GROUP" && (
          <p className="text-xs text-text-secondary">Групповые уроки считаются по тарифу школы; свой групповой тариф пока нельзя выбрать ученику.</p>
        )}
        {!tariff && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Цена за урок-час, ₽" id="t-price">
              <Input id="t-price" inputMode="numeric" value={price} onChange={(e) => setPrice(rubles(e.target.value))} />
            </Field>
            <Field label="Действует с" id="t-from">
              <Input id="t-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
          </div>
        )}
        {tariff && (
          <div className="flex justify-end">
            <Button variant="outline" disabled={pending || !name.trim()} onClick={save}>
              {pending && <Loader2Icon className="animate-spin" />}
              Сохранить
            </Button>
          </div>
        )}
        {tariff && <Prices tariff={tariff} today={today} />}
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          {tariff ? "Закрыть" : "Отмена"}
        </Button>
        {!tariff && (
          <Button disabled={pending || !name.trim() || !price} onClick={save}>
            {pending && <Loader2Icon className="animate-spin" />}
            Создать тариф
          </Button>
        )}
      </SheetFooter>
    </div>
  );
}

/** История цен тарифа и новая цена с даты. */
function Prices({ tariff, today }: { tariff: TariffListItem; today: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState(today);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Сохранено");
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  const rows = [
    ...tariff.upcoming.map((p) => ({ ...p, state: "upcoming" as const })).reverse(),
    ...(tariff.current ? [{ ...tariff.current, state: "current" as const }] : []),
    ...tariff.past.map((p) => ({ ...p, state: "past" as const })),
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-subtle/50 p-3">
      <div className="text-sm font-medium">Цены</div>
      <ul className="divide-y rounded-md border bg-surface text-sm">
        {rows.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-3 px-3 py-2", p.state === "past" && "text-text-secondary")}>
            <span className="tabular-nums">{formatRub(p.pricePerHour)}</span>
            <span className="text-text-secondary">с {formatLocalDate(p.validFrom)}</span>
            <span className="ml-auto text-xs">
              {p.state === "current" && <span className="rounded bg-done-soft px-1.5 py-0.5 text-done">действует</span>}
              {p.state === "upcoming" && <span className="rounded bg-planned-soft px-1.5 py-0.5 text-planned">запланирована</span>}
            </span>
            {p.state === "upcoming" && (
              <Button variant="ghost" size="icon-sm" aria-label="Удалить цену" disabled={pending} onClick={() => run(() => deleteTariffPriceAction(p.id))}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <Field label="Новая цена, ₽" id="t-new-price">
          <Input id="t-new-price" inputMode="numeric" value={price} onChange={(e) => setPrice(rubles(e.target.value))} />
        </Field>
        <Field label="С даты" id="t-new-from">
          <Input id="t-new-from" type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Button disabled={pending || !price} onClick={() => run(() => setTariffPriceAction(tariff.id, { pricePerHour: Number(price), validFrom: from }), () => setPrice(""))}>
          Задать
        </Button>
      </div>
      <p className="text-xs text-text-secondary">Цена на ту же дату заменит запланированную.</p>
    </div>
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
