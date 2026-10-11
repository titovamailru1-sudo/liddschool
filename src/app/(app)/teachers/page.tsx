import { GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { formatRub } from "@/domain/format";
import { can } from "@/lib/access";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Педагоги" };

export default async function TeachersPage() {
  const user = await requirePermission("teachers.view");
  const showRates = can(user.role, "teachers.rates");

  const teachers = await prisma.teacher.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      color: true,
      subjects: true,
      _count: { select: { series: true } },
    },
  });

  // Ставки запрашиваются только для владельца — администратору они даже не уходят с сервера.
  const rateByTeacher = new Map<string, number>();
  if (showRates) {
    const assignments = await prisma.teacherRatePlan.findMany({
      where: { teacherId: { in: teachers.map((t) => t.id) } },
      orderBy: { validFrom: "asc" },
      select: { teacherId: true, plan: { select: { baseAmount: true } } },
    });
    for (const a of assignments) rateByTeacher.set(a.teacherId, a.plan.baseAmount); // последняя по дате побеждает
  }

  return (
    <>
      <PageHeader title="Педагоги" description="Карточки, ставки и начисления — этап 4" />
      {teachers.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Педагогов пока нет" hint="Добавьте первого педагога и пригласите его в CRM." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">ФИО</th>
                <th className="px-4 py-2.5 font-medium">Предметы</th>
                <th className="px-4 py-2.5 font-medium">Регулярных занятий</th>
                {showRates && <th className="px-4 py-2.5 font-medium">Ставка</th>}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                      {t.fullName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{t.subjects.join(", ")}</td>
                  <td className="px-4 py-3 tabular-nums">{t._count.series}</td>
                  {showRates && (
                    <td className="px-4 py-3">
                      {rateByTeacher.has(t.id) ? `${formatRub(rateByTeacher.get(t.id)!)} / урок-час` : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
