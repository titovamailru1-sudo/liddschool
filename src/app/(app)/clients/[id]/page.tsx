import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { isoWeekday, localDateOf } from "@/domain/calendar";
import { formatDate, formatRub, formatTime, weekdayShort } from "@/domain/format";
import { can } from "@/lib/access";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { now } from "@/server/clock";
import { clientCard } from "@/server/clients/queries";
import { lessonFormOptions } from "@/server/lessons/queries";
import { requirePermission } from "@/server/session";
import { ClientSchedule } from "./client-schedule";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("clients.view");
  const { id } = await params;
  const at = now();
  const card = await clientCard(user, id, at);
  if (!card) notFound();
  const canManage = can(user.role, "lessons.manage");
  const options = canManage ? await lessonFormOptions(user) : null;

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Клиенты
      </Link>
      <PageHeader
        title={card.fullName}
        description={[card.grade ? `${card.grade} класс` : null, PROGRAM_LABEL[card.program], PAYMENT_MODE_LABEL[card.paymentMode]]
          .filter(Boolean)
          .join(" · ")}
        actions={
          card.balance !== null && (
            <div className="rounded-lg border bg-surface px-4 py-2 text-right">
              <div className="text-xs text-text-secondary">Баланс</div>
              <div className={cn("text-lg font-semibold tabular-nums", card.balance < 0 ? "text-danger" : "text-done")}>
                {formatRub(card.balance)}
              </div>
            </div>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <ClientSchedule
            clientId={card.id}
            series={card.series}
            groups={card.groups}
            canManage={canManage}
            options={options}
            today={localDateOf(at)}
          />
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Ближайшие уроки</h2>
            {card.upcoming.length === 0 ? (
              <p className="text-sm text-text-secondary">Запланированных уроков нет.</p>
            ) : (
              <ul className="space-y-2">
                {card.upcoming.map((l) => {
                  const d = new Date(l.startsAt);
                  return (
                    <li key={l.id}>
                      <Link
                        href={`/lessons?view=day&date=${localDateOf(d)}&lesson=${l.id}`}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-subtle"
                      >
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

          {card.parents.length > 0 && (
            <section className="rounded-lg border bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Родители</h2>
              <ul className="space-y-2 text-sm">
                {card.parents.map((p) => (
                  <li key={p.id}>
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-text-secondary">
                      {p.relation && `${p.relation} · `}
                      <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                        {p.phone}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {card.goal && (
            <section className="rounded-lg border bg-surface p-4 text-sm">
              <h2 className="mb-1 font-semibold">Цель обучения</h2>
              <p className="text-text-secondary">{card.goal}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
