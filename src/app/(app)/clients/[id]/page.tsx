import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { isoWeekday, localDateOf, nextMonth, parseLocalDate } from "@/domain/calendar";
import { formatDate, formatRub, formatTime, monthName, weekdayShort } from "@/domain/format";
import { can } from "@/lib/access";
import { LESSON_STATUS, PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { clientFinance } from "@/server/billing/queries";
import { now } from "@/server/clock";
import { clientCard } from "@/server/clients/queries";
import { lessonFormOptions } from "@/server/lessons/queries";
import { requirePermission } from "@/server/session";
import { ClientActions } from "./client-actions";
import { prisma } from "@/server/db";
import { leadOfClient } from "@/server/leads/service";
import { listTasks } from "@/server/tasks/service";
import { ClientMoney, ClientMessages, ClientProfile, ClientTasks } from "./client-tabs";
import { ClientSchedule } from "./client-schedule";

const TABS = [
  { key: "profile", label: "Профиль" },
  { key: "schedule", label: "Расписание" },
  { key: "invoices", label: "Счета", money: true },
  { key: "payments", label: "Платежи", money: true },
  { key: "visits", label: "Посещения" },
  { key: "messages", label: "Сообщения", money: true },
  { key: "tasks", label: "Задачи", money: true },
] as const;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("clients.view");
  const { id } = await params;
  const { tab } = await searchParams;
  const at = now();
  const today = localDateOf(at);
  const card = await clientCard(user, id, at);
  if (!card) notFound();

  const money = can(user.role, "finance.payments");
  const canManage = can(user.role, "lessons.manage");
  const canEdit = can(user.role, "clients.edit");
  const tabs = TABS.filter((t) => !("money" in t) || money);
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const [options, finance, leadHistory, tasks] = await Promise.all([
    canManage ? lessonFormOptions(user) : Promise.resolve(null),
    money ? clientFinance(card.id) : Promise.resolve(null),
    money ? leadOfClient(prisma, card.id) : Promise.resolve(null),
    money && active.key === "tasks" ? listTasks(prisma, user, { clientId: card.id, showDone: true }, at) : Promise.resolve([]),
  ]);
  const { year, month } = parseLocalDate(today);
  const next = nextMonth(year, month);

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Клиенты
      </Link>
      <PageHeader
        title={card.fullName}
        description={[card.grade ? `${card.grade} класс` : null, PROGRAM_LABEL[card.program], PAYMENT_MODE_LABEL[card.paymentMode], card.tariffName && `тариф «${card.tariffName}»`, card.status === "PAUSED" ? "на паузе" : card.status === "ARCHIVED" ? "в архиве" : null]
          .filter(Boolean)
          .join(" · ")}
        actions={
          card.balance !== null && (
            <div className="rounded-lg border bg-surface px-4 py-2 text-right">
              <div className="text-xs text-text-secondary">Баланс</div>
              <div className={cn("text-lg font-semibold tabular-nums", card.balance < 0 ? "text-danger" : "text-done")}>{formatRub(card.balance)}</div>
            </div>
          )
        }
      />

      {(money || canEdit || canManage) && (
        <ClientActions
          card={card}
          today={today}
          options={options}
          perms={{ money, edit: canEdit, manage: canManage }}
          openInvoices={(finance?.invoices ?? [])
            .filter((i) => i.status === "SENT" || i.status === "VIEWED" || i.status === "PARTIALLY_PAID")
            .map((i) => ({ id: i.id, label: `Абонемент, ${monthName(Number(i.month.slice(5, 7)))} ${i.month.slice(0, 4)}`, due: Math.max(0, i.total - i.paid) }))}
          months={{ current: { year, month }, next }}
        />
      )}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Разделы карточки">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/clients/${card.id}?tab=${t.key}`}
            scroll={false}
            aria-current={t.key === active.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-text-secondary hover:text-text-primary",
              t.key === active.key && "border-brand text-brand-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active.key === "profile" && <ClientProfile card={card} canEdit={canEdit} leadHistory={leadHistory} />}
      {active.key === "tasks" && <ClientTasks clientId={card.id} tasks={tasks} />}
      {active.key === "schedule" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <ClientSchedule clientId={card.id} series={card.series} groups={card.groups} canManage={canManage} options={options} today={today} />
          <section className="rounded-lg border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Ближайшие уроки</h2>
            {card.upcoming.length === 0 ? (
              <p className="text-sm text-text-secondary">Запланированных уроков нет.</p>
            ) : (
              <ul className="space-y-1">
                {card.upcoming.map((l) => {
                  const d = new Date(l.startsAt);
                  return (
                    <li key={l.id}>
                      <Link href={`/lessons?view=day&date=${localDateOf(d)}&lesson=${l.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-subtle">
                        <span className="w-1 self-stretch rounded-full" style={{ background: l.teacher.color }} />
                        <span className="flex-1">
                          <span className="block font-medium">
                            {formatDate(d)}, {weekdayShort(isoWeekday(localDateOf(d)))} {formatTime(d)}
                          </span>
                          <span className="block text-xs text-text-secondary">
                            {l.subject} · {l.title} · {l.teacher.fullName}
                          </span>
                        </span>
                        {l.status === "DONE" && <StatusBadge tone="done">Проведён</StatusBadge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
      {(active.key === "invoices" || active.key === "payments") && finance && (
        <ClientMoney view={active.key} finance={finance} clientId={card.id} clientName={card.fullName} today={today} />
      )}
      {active.key === "messages" && finance && <ClientMessages messages={finance.messages} />}
      {active.key === "visits" && (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          {card.visits.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-secondary">Уроков пока не было.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Дата</th>
                  <th className="px-4 py-2.5 font-medium">Урок</th>
                  <th className="px-4 py-2.5 font-medium">Педагог</th>
                  <th className="px-4 py-2.5 font-medium">Тема</th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {card.visits.map((v) => {
                  const d = new Date(v.startsAt);
                  const own = v.ownStatus === "ABSENT_EXCUSED" ? "excused" : v.ownStatus === "ABSENT_UNEXCUSED" ? "unexcused" : v.status;
                  const st = LESSON_STATUS[own];
                  return (
                    <tr key={v.id} className="border-t">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link href={`/lessons?view=day&date=${localDateOf(d)}&lesson=${v.id}`} className="hover:underline">
                          {formatDate(d)} {formatTime(d)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {v.subject} · {v.title} · {v.durationMin} мин
                      </td>
                      <td className="px-4 py-2.5">{v.teacher.fullName}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{v.topic ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
