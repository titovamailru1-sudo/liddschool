import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PayrollDetail } from "@/components/payroll/payroll-detail";
import { Button } from "@/components/ui/button";
import { addDays, firstOfMonth, lastOfMonth, localDateOf, parseLocalDate } from "@/domain/calendar";
import { formatLocalDate, monthName, weekdayShort } from "@/domain/format";
import { can } from "@/lib/access";
import { cn } from "@/lib/utils";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { teacherMonth } from "@/server/payroll/payroll";
import { teacherCard } from "@/server/payroll/queries";
import { listPlans, nextMonthStart, planHistory } from "@/server/payroll/rates";
import { requirePermission } from "@/server/session";
import { MonthLinks, TeacherProfile, TeacherRate } from "./teacher-tabs";

const TABS = [
  { key: "profile", label: "Профиль" },
  { key: "schedule", label: "Расписание" },
  { key: "rate", label: "Ставка и надбавки", owner: true },
  { key: "accruals", label: "Начисления", owner: true },
] as const;

export default async function TeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const user = await requirePermission("teachers.view");
  const { id } = await params;
  const sp = await searchParams;
  const card = await teacherCard(id);
  if (!card) notFound();
  const owner = can(user.role, "teachers.rates");
  const tabs = TABS.filter((t) => !("owner" in t) || owner);
  const active = tabs.find((t) => t.key === sp.tab) ?? tabs[0];
  const today = localDateOf(now());

  let body: React.ReactNode = null;
  if (active.key === "profile") body = <TeacherProfile card={card} canEdit={can(user.role, "teachers.edit")} />;
  if (active.key === "schedule") {
    body = (
      <section className="rounded-lg border bg-surface">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Регулярные занятия</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/lessons?view=week&teacher=${card.id}`}>
              <CalendarDays /> Открыть в календаре
            </Link>
          </Button>
        </div>
        {card.series.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-secondary">Регулярных занятий нет.</p>
        ) : (
          <ul className="divide-y text-sm">
            {card.series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="w-24 font-semibold">
                  {weekdayShort(s.weekday)} {s.startTime}
                </span>
                <span className="flex-1">
                  {s.href ? (
                    <Link href={s.href} className="hover:underline">
                      {s.title}
                    </Link>
                  ) : (
                    s.title
                  )}
                  <span className="text-text-secondary">
                    {" "}
                    · {s.subject} · {s.durationMin} мин
                  </span>
                </span>
                <span className="text-text-secondary">
                  с {formatLocalDate(s.startsOn)} {s.endsOn ? `по ${formatLocalDate(s.endsOn)}` : "· бессрочно"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  if (active.key === "rate") {
    const [history, plans] = await Promise.all([planHistory(prisma, card.id), listPlans(prisma, today)]);
    body = <TeacherRate teacherId={card.id} history={history} plans={plans} minFrom={nextMonthStart(today)} today={today} />;
  }
  if (active.key === "accruals") {
    const t = parseLocalDate(today);
    let [y, m] = [t.year, t.month];
    if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) [y, m] = sp.month.split("-").map(Number);
    const start = firstOfMonth(y, m);
    const view = await teacherMonth(prisma, card.id, y, m, today);
    body = (
      <div className="space-y-4">
        <MonthLinks
          base={`/teachers/${card.id}?tab=accruals`}
          label={`${monthName(m)} ${y}`}
          prev={addDays(start, -1).slice(0, 7)}
          next={addDays(lastOfMonth(y, m), 1).slice(0, 7)}
        />
        <PayrollDetail view={view} canManage today={today} />
      </div>
    );
  }

  return (
    <>
      <Link href="/teachers" className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ChevronLeft className="size-4" /> Педагоги
      </Link>
      <PageHeader
        title={card.fullName}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: card.color }} />
            {card.subjects.join(", ")}
            {!card.isActive && " · не работает в школе"}
          </span>
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Разделы карточки педагога">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/teachers/${card.id}?tab=${t.key}`}
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
      {body}
    </>
  );
}
