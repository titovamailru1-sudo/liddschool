"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, FileText, Pencil, Scale, Wallet } from "lucide-react";
import { toast } from "sonner";
import { rebuildDraftAction } from "@/app/(app)/subscriptions/actions";
import { AdjustDialog } from "@/components/billing/adjust-dialog";
import { PaymentDialog } from "@/components/billing/payment-dialog";
import { CreateLessonSheet } from "@/components/lessons/create-lesson-sheet";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { monthName, monthNameGen } from "@/domain/format";
import type { ClientCard } from "@/server/clients/queries";
import type { LessonFormOptions } from "@/server/lessons/queries";
import { ClientSheet } from "../client-sheet";

type YM = { year: number; month: number };

export function ClientActions({
  card,
  today,
  options,
  perms,
  openInvoices,
  months,
}: {
  card: ClientCard;
  today: string;
  options: LessonFormOptions | null;
  perms: { money: boolean; edit: boolean; manage: boolean };
  openInvoices: { id: string; label: string; due: number }[];
  months: { current: YM; next: YM };
}) {
  const router = useRouter();
  const [pay, setPay] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const [edit, setEdit] = useState(false);
  const [lesson, setLesson] = useState(false);
  const [pending, startTransition] = useTransition();

  const invoice = (m: YM, fromToday: boolean) =>
    startTransition(async () => {
      const r = await rebuildDraftAction(card.id, m, fromToday);
      if (r.ok) {
        toast.success("Черновик счёта готов — проверьте и отправьте в «Абонементах»");
        router.push(`/subscriptions?month=${m.year}-${String(m.month).padStart(2, "0")}`);
      } else toast.error(r.error);
    });

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {perms.money && (
        <Button onClick={() => setPay(true)}>
          <Wallet /> Принять оплату
        </Button>
      )}
      {perms.money && card.paymentMode === "MONTHLY" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>
              <FileText /> Выставить счёт
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => invoice(months.current, true)}>
              На оставшиеся уроки {monthNameGen(months.current.month)}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => invoice(months.next, false)}>На {monthName(months.next.month)}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {perms.manage && options && (
        <Button variant="outline" onClick={() => setLesson(true)}>
          <CalendarPlus /> Записать на урок
        </Button>
      )}
      {perms.money && (
        <Button variant="outline" onClick={() => setAdjust(true)}>
          <Scale /> Возврат / корректировка
        </Button>
      )}
      {perms.edit && (
        <Button variant="ghost" onClick={() => setEdit(true)}>
          <Pencil /> Редактировать
        </Button>
      )}

      <PaymentDialog
        open={pay}
        onOpenChange={setPay}
        target={{ clientId: card.id, clientName: card.fullName, invoices: openInvoices }}
        today={today}
      />
      <AdjustDialog open={adjust} onOpenChange={setAdjust} clientId={card.id} />
      {options && (
        <CreateLessonSheet open={lesson} onOpenChange={setLesson} options={options} defaults={{ date: today, clientId: card.id }} onCreated={() => router.refresh()} />
      )}
      <ClientSheet
        open={edit}
        onOpenChange={setEdit}
        initial={{
          id: card.id,
          fullName: card.fullName,
          gender: card.gender,
          fullNameGen: card.fullNameGen,
          grade: card.grade,
          school: card.school,
          phone: card.phone,
          program: card.program,
          paymentMode: card.paymentMode,
          tariffId: card.tariffId,
          status: card.status,
          goal: card.goal,
          source: card.source,
          notes: card.notes,
          parents: card.parents.map((p) => ({ id: p.id, fullName: p.fullName, relation: p.relation, phone: p.phone })),
        }}
      />
    </div>
  );
}
