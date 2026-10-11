"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArrowDownUp, Download, Pause, Play, Plus, Search, Send, User, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub } from "@/domain/format";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ClientFilters, ClientRow } from "@/server/clients/queries";
import { setClientsStatusAction } from "./actions";
import { ClientSheet, EMPTY_CLIENT } from "./client-sheet";

const PAGE = 50;
const STATUS = { ACTIVE: { label: "Активен", tone: "done" }, PAUSED: { label: "Пауза", tone: "warning" }, ARCHIVED: { label: "Архив", tone: "cancelled" } } as const;

export function ClientsTable({
  rows,
  filters,
  teachers,
  perms,
}: {
  rows: ClientRow[];
  filters: ClientFilters;
  teachers: { id: string; fullName: string }[];
  perms: { create: boolean; edit: boolean; money: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    setPage(0);
    setSelected(new Set());
    router.push(`/clients?${next.toString()}`, { scroll: false });
  };
  const hasFilters = !!(filters.q || filters.status || filters.program || filters.paymentMode || filters.teacherId || filters.debt);
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const allOnPage = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const mass = (status: "ACTIVE" | "PAUSED" | "ARCHIVED") =>
    startTransition(async () => {
      const r = await setClientsStatusAction([...selected], status);
      if (r.ok) toast.success(r.message ?? "Готово");
      else toast.error(r.error);
      setSelected(new Set());
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative w-72"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim() || null);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
          <Input name="q" defaultValue={filters.q} placeholder="ФИО, родитель или телефон" className="h-9 bg-surface pl-9" aria-label="Поиск клиентов" />
        </form>
        <Filter
          label="Статус"
          value={filters.status}
          onChange={(v) => set("status", v)}
          options={[
            ["ACTIVE", "Активные"],
            ["PAUSED", "На паузе"],
            ["ARCHIVED", "Архив"],
            ["ALL", "Все, включая архив"],
          ]}
          allLabel="Статус: активные и пауза"
        />
        <Filter label="Программа" value={filters.program} onChange={(v) => set("program", v)} options={[["EXAM", "ОГЭ / ЕГЭ"], ["SCHOOL", "Школьная"]]} />
        <Filter label="Оплата" value={filters.paymentMode} onChange={(v) => set("mode", v)} options={[["MONTHLY", "Абонемент"], ["PER_LESSON", "Поурочно"]]} />
        {teachers.length > 0 && (
          <Filter label="Педагог" value={filters.teacherId} onChange={(v) => set("teacher", v)} options={teachers.map((t) => [t.id, t.fullName] as [string, string])} />
        )}
        {perms.money && (
          <label className="flex h-9 items-center gap-2 rounded-md border bg-surface px-3 text-sm">
            <Checkbox checked={!!filters.debt} onCheckedChange={(v) => set("debt", v === true ? "1" : null)} /> Есть долг
          </label>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/clients")}>
            <X /> Сбросить
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/clients/export?${params.toString()}`}>
              <Download /> Excel
            </a>
          </Button>
          {perms.create && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Ученик
            </Button>
          )}
        </div>
      </div>

      {perms.edit && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-4 py-2 text-sm">
          <span className="font-medium text-brand-text">Выбрано: {selected.size}</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => mass("PAUSED")}>
            <Pause /> На паузу
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => mass("ARCHIVED")}>
            <Archive /> В архив
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => mass("ACTIVE")}>
            <Play /> Активные
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Снять выбор
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={User}
          title={hasFilters ? "Никого не нашли" : "Учеников пока нет"}
          hint={hasFilters ? "Измените условия поиска или сбросьте фильтры." : "Добавьте первого ученика кнопкой «+ Ученик»."}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-text-secondary">
                <tr>
                  {perms.edit && (
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        aria-label="Выбрать всех на странице"
                        checked={allOnPage}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          for (const r of visible) {
                            if (v === true) next.add(r.id);
                            else next.delete(r.id);
                          }
                          setSelected(next);
                        }}
                      />
                    </th>
                  )}
                  <th className="px-3 py-2.5 font-medium">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-text-primary" onClick={() => set("sort", null)}>
                      ФИО {filters.sort !== "balance" && <ArrowDownUp className="size-3" />}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">Родитель</th>
                  <th className="px-3 py-2.5 font-medium">Предметы и педагоги</th>
                  <th className="px-3 py-2.5 font-medium">Оплата</th>
                  <th className="px-3 py-2.5 font-medium">Статус</th>
                  {perms.money && (
                    <th className="px-3 py-2.5 text-right font-medium">
                      <button type="button" className="inline-flex items-center gap-1 hover:text-text-primary" onClick={() => set("sort", "balance")}>
                        Баланс {filters.sort === "balance" && <ArrowDownUp className="size-3" />}
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className={cn("border-t hover:bg-subtle/60", selected.has(c.id) && "bg-brand-soft/40")}>
                    {perms.edit && (
                      <td className="px-3 py-2.5">
                        <Checkbox
                          aria-label={`Выбрать ${c.fullName}`}
                          checked={selected.has(c.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selected);
                            if (v === true) next.add(c.id);
                            else next.delete(c.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-brand-text hover:underline">
                        {c.fullName}
                      </Link>
                      <div className="text-xs text-text-secondary">
                        {c.grade ? `${c.grade} кл. · ` : ""}
                        {PROGRAM_LABEL[c.program]}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.parent ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            {c.parent.fullName}
                            {c.parent.telegram && <Send className="size-3 text-planned" aria-label="Telegram подключён" />}
                          </span>
                          <div className="text-xs text-text-secondary">{c.parent.phone}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-text-secondary">{c.subjects.join(", ") || "—"}</div>
                      <div className="flex flex-wrap gap-x-3">
                        {c.teachers.map((t) => (
                          <span key={t.fullName} className="inline-flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ background: t.color }} />
                            {t.fullName}
                          </span>
                        ))}
                        {c.groups.map((g) => (
                          <span key={g} className="text-text-secondary">
                            {g}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{PAYMENT_MODE_LABEL[c.paymentMode]}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</StatusBadge>
                    </td>
                    {perms.money && (
                      <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", (c.balance ?? 0) < 0 ? "text-danger" : "text-done")}>
                        {formatRub(c.balance ?? 0)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-text-secondary">
            <span>
              {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} из {rows.length}
            </span>
            {pages > 1 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Назад
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  Вперёд
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {perms.create && <ClientSheet open={createOpen} onOpenChange={setCreateOpen} initial={EMPTY_CLIENT} />}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value?: string;
  onChange: (v: string | null) => void;
  options: [string, string][];
  allLabel?: string;
}) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger className={cn("h-9 w-auto min-w-36", value && "border-brand text-brand-text")} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel ?? `${label}: все`}</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
