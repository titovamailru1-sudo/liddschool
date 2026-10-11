import { PageHeader } from "@/components/layout/page-header";
import { localDateOf, parseLocalDate, viewRange, type CalendarView } from "@/domain/calendar";
import { formatRub } from "@/domain/format";
import { can } from "@/lib/access";
import { LESSON_STATUS, type LessonDisplayStatus } from "@/lib/status";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { ensureLessons } from "@/server/lessons/generation";
import { calendarLessons, daySummary, lessonDetail, lessonFormOptions } from "@/server/lessons/queries";
import { requirePermission } from "@/server/session";
import { LessonsView } from "./_components/lessons-view";

export const metadata = { title: "Уроки" };

const VIEWS: CalendarView[] = ["day", "week", "month", "list"];

type Search = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

function validDate(v: string | undefined, fallback: string) {
  if (!v) return fallback;
  try {
    parseLocalDate(v);
    return v;
  } catch {
    return fallback;
  }
}

export default async function LessonsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("lessons.view");
  const sp = await searchParams;
  const at = now();
  const today = localDateOf(at);

  const view = VIEWS.includes(sp.view as CalendarView) ? (sp.view as CalendarView) : "day";
  const date = validDate(str(sp.date), today);
  const range = viewRange(view, date);
  const status = str(sp.status);
  const filters = {
    teacher: str(sp.teacher),
    subject: str(sp.subject),
    client: str(sp.client),
    group: str(sp.group),
    status: status && status in LESSON_STATUS ? status : undefined,
  };

  // Уроки бессрочных серий за горизонтом генерации досоздаются при первом просмотре периода.
  await ensureLessons(prisma, range.from, range.to);

  const lessonId = str(sp.lesson);
  const [lessons, summary, options, detail] = await Promise.all([
    calendarLessons(user, range.from, range.to, {
      teacherId: filters.teacher,
      subject: filters.subject,
      clientId: filters.client,
      groupId: filters.group,
      status: filters.status as LessonDisplayStatus | undefined,
    }),
    daySummary(user, today, at),
    lessonFormOptions(user),
    lessonId ? lessonDetail(user, lessonId) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="Уроки" />
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-surface px-4 py-2.5 text-sm">
        <span>
          Уроков сегодня: <b>{summary.total}</b>
        </span>
        <span>
          Неотмеченных прошедших: <b className={summary.unmarked ? "text-danger" : undefined}>{summary.unmarked}</b>
        </span>
        {summary.revenue !== null && (
          <span>
            Выручка за день: <b>{formatRub(summary.revenue)}</b>
          </span>
        )}
      </div>
      <LessonsView
        view={view}
        date={date}
        range={range}
        today={today}
        nowIso={at.toISOString()}
        lessons={lessons}
        detail={detail}
        options={options}
        role={user.role}
        perms={{
          canCreate: can(user.role, "lessons.create"),
          canMark: can(user.role, "lessons.mark"),
          canManage: can(user.role, "lessons.manage"),
        }}
        filters={filters}
        createOpen={sp.create === "1"}
      />
    </>
  );
}
