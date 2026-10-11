import Link from "next/link";
import { Search, User } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { formatRub } from "@/domain/format";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { clientList } from "@/server/clients/queries";
import { requirePermission } from "@/server/session";

export const metadata = { title: "Клиенты" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("clients.view");
  const { q } = await searchParams;
  const clients = await clientList(user, q?.trim() || undefined);
  const showBalance = clients.some((c) => c.balance !== null);

  return (
    <>
      <PageHeader
        title="Клиенты"
        description={user.role === "TEACHER" ? "Ваши ученики" : "Полная таблица с фильтрами и массовыми действиями — этап 3"}
      />
      <form className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
        <Input name="q" defaultValue={q} placeholder="Поиск по ФИО" className="bg-surface pl-9" aria-label="Поиск по ФИО" />
      </form>
      {clients.length === 0 ? (
        <EmptyState icon={User} title={q ? "Никого не нашли" : "Учеников пока нет"} hint={q ? "Проверьте написание ФИО." : "Ученики появятся после добавления или перевода из лидов."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">ФИО</th>
                <th className="px-4 py-2.5 font-medium">Класс</th>
                <th className="px-4 py-2.5 font-medium">Программа</th>
                <th className="px-4 py-2.5 font-medium">Оплата</th>
                <th className="px-4 py-2.5 font-medium">Педагоги и группы</th>
                {showBalance && <th className="px-4 py-2.5 text-right font-medium">Баланс</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t hover:bg-subtle/60">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:text-brand-text hover:underline">
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{c.grade ?? "—"}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{PROGRAM_LABEL[c.program]}</td>
                  <td className="px-4 py-2.5">{PAYMENT_MODE_LABEL[c.paymentMode]}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
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
                  {showBalance && (
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", (c.balance ?? 0) < 0 ? "text-danger" : "text-done")}>
                      {formatRub(c.balance ?? 0)}
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
