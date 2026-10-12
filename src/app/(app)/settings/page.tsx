import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatTime } from "@/domain/format";
import { loadSettings } from "@/server/billing/settings";
import { WORKER_HEARTBEAT_KEY } from "@/server/alerts";
import { prisma } from "@/server/db";
import { botUsername, messageSender } from "@/server/messaging/telegram";
import { requirePermission } from "@/server/session";
import { PayeeForm, RunJobsButton } from "./settings-forms";

export const metadata = { title: "Настройки" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const settings = await loadSettings(prisma);
  const sender = messageSender();
  const [username, runs, linkedParents, parents] = await Promise.all([
    sender ? botUsername() : Promise.resolve(null),
    prisma.jobRun.findMany({ where: { key: { not: WORKER_HEARTBEAT_KEY } }, orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.parent.count({ where: { telegramChatId: { not: null } } }),
    prisma.parent.count(),
  ]);

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Реквизиты для оплаты</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Показываются родителям на странице оплаты по ссылке из сообщения, вместе с QR-кодом для банковского приложения.
          </p>
          <PayeeForm initial={settings.payee} />
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border bg-surface p-4 text-sm">
            <h2 className="mb-3 font-semibold">Telegram-бот для родителей</h2>
            {sender?.kind === "telegram" ? (
              <p>
                <StatusBadge tone="done">Подключён</StatusBadge> {username ? `@${username}` : "имя бота не получено — проверьте токен"}
              </p>
            ) : sender?.kind === "fake" ? (
              <p>
                <StatusBadge tone="warning">Режим заглушки</StatusBadge> Сообщения пишутся в лог воркера (TELEGRAM_FAKE=1).
              </p>
            ) : (
              <p>
                <StatusBadge tone="cancelled">Не настроен</StatusBadge> Создайте бота у @BotFather и впишите токен в <code>.env</code>:{" "}
                <code>TELEGRAM_BOT_TOKEN=…</code>, затем перезапустите сервер и воркер.
              </p>
            )}
            <p className="mt-2 text-text-secondary">
              Родителей подключено: {linkedParents} из {parents}. Ссылка-приглашение — в карточке ученика.
            </p>
          </section>

          <section className="rounded-lg border bg-surface p-4 text-sm">
            <h2 className="mb-3 font-semibold">Расписание оплат</h2>
            <dl className="space-y-1">
              <Item label="Формирование счетов на следующий месяц" value={`${settings.invoiceDay}-го числа`} />
              <Item label="Срок оплаты абонемента и списание" value={`${settings.invoiceDueDay}-го числа`} />
              <Item label="Просрочка: задача и напоминание" value={`${settings.overdueDay}-го числа`} />
              <Item label="Ссылка на оплату урока" value={`за ${settings.perLessonLinkHours} ч`} />
              <Item label="Дедлайн оплаты урока" value={`за ${settings.perLessonDeadlineHours} ч`} />
              <Item label="Отмена школой — вычет в следующем счёте" value={settings.creditOnSchoolCancel ? "да" : "нет"} />
              <Item label="Уважительный пропуск — вычет" value={settings.creditOnExcused ? "да" : "нет"} />
            </dl>
          </section>

          <section className="rounded-lg border bg-surface p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Фоновые задачи</h2>
              <RunJobsButton />
            </div>
            <p className="mb-3 text-text-secondary">
              Обычно их раз в минуту выполняет отдельный процесс <code>npm run worker</code>. Кнопка запускает их сразу.
            </p>
            {runs.length > 0 && (
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <code className="text-xs">{r.key}</code>
                    <span className="text-text-secondary">
                      {formatDate(r.startedAt)} {formatTime(r.startedAt)}
                      {!r.finishedAt && " · выполняется"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
