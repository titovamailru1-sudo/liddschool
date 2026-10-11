import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CircleCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { payeeComplete, paymentQrString } from "@/domain/billing";
import { formatRub } from "@/domain/format";
import { loadSettings } from "@/server/billing/settings";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Оплата занятий", robots: { index: false, follow: false } };

/** «Иванов Миша» → «Миша И.» — на публичной странице не показываем полное ФИО. */
function shortName(fullName: string) {
  const [last, first] = fullName.split(/\s+/);
  return first ? `${first} ${last[0]}.` : fullName;
}

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{10,64}$/.test(token)) notFound();
  const link = await prisma.paymentLink.findUnique({
    where: { token },
    include: {
      client: { select: { fullName: true } },
      invoice: { select: { id: true, status: true, total: true, payments: { where: { cancelledAt: null }, select: { amount: true } } } },
    },
  });
  if (!link) notFound();

  let due = link.amount;
  let paid = false;
  if (link.invoice) {
    const sum = link.invoice.payments.reduce((s, p) => s + p.amount, 0);
    due = Math.max(0, link.invoice.total - sum);
    paid = link.invoice.status === "PAID" || due === 0;
    // Родитель открыл ссылку — отмечаем, что счёт просмотрен.
    if (link.invoice.status === "SENT") {
      await prisma.monthlyInvoice.update({ where: { id: link.invoice.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    }
  } else if (link.lessonId) {
    const sum = await prisma.payment.aggregate({ where: { lessonId: link.lessonId, clientId: link.clientId, cancelledAt: null }, _sum: { amount: true } });
    paid = (sum._sum.amount ?? 0) >= link.amount;
  }

  const { payee } = await loadSettings(prisma);
  const sbpPhone = payee.sbpPhone;
  const purpose = link.purpose.replace(link.client.fullName, shortName(link.client.fullName));
  const qr = payeeComplete(payee) && !paid ? await QRCode.toDataURL(paymentQrString(payee, due, purpose), { margin: 1, width: 240 }) : null;

  return (
    <main className="flex min-h-screen items-start justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-lg border bg-surface p-6 shadow-sm">
        <Logo />
        <div>
          <p className="text-sm text-text-secondary">{purpose}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatRub(paid ? link.amount : due)}</p>
        </div>

        {paid ? (
          <div className="flex items-center gap-2 rounded-md bg-done-soft px-3 py-3 text-done">
            <CircleCheck className="size-5" /> Оплачено. Спасибо!
          </div>
        ) : payeeComplete(payee) ? (
          <>
            {qr && (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- QR сгенерирован на сервере как data URL */}
                <img src={qr} alt="QR-код для оплаты в банковском приложении" width={240} height={240} />
                <p className="text-center text-xs text-text-secondary">Отсканируйте в приложении банка: «Оплата по QR». Сумма и реквизиты заполнятся сами.</p>
              </div>
            )}
            <dl className="space-y-1.5 border-t pt-4 text-sm">
              <Item label="Получатель" value={payee.name} />
              {payee.payeeInn && <Item label="ИНН" value={payee.payeeInn} />}
              <Item label="Банк" value={payee.bankName} />
              <Item label="БИК" value={payee.bic} />
              <Item label="Расчётный счёт" value={payee.personalAcc} />
              <Item label="Корр. счёт" value={payee.correspAcc} />
              <Item label="Назначение" value={purpose} />
              {sbpPhone && <Item label="СБП по номеру" value={sbpPhone} />}
            </dl>
          </>
        ) : (
          <p className="rounded-md bg-warning-soft px-3 py-3 text-sm text-warning">
            Реквизиты для оплаты ещё не заполнены. Пожалуйста, уточните способ оплаты у администратора школы.
          </p>
        )}

        <p className="text-xs text-text-secondary">После оплаты администратор отметит платёж — подтверждение придёт в Telegram.</p>
      </div>
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium break-all">{value}</dd>
    </div>
  );
}
