import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SITE } from "@/lib/site";
import { loadSettings } from "@/server/billing/settings";
import { prisma } from "@/server/db";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: `Как ${SITE.name} обрабатывает персональные данные учеников и родителей.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Политика обработки персональных данных (152-ФЗ). Оператор — получатель из реквизитов в «Настройках».
 * Текст — типовой; владельцу школы стоит сверить его со своей ситуацией.
 */
export default async function PrivacyPage() {
  const { payee, site } = await loadSettings(prisma);
  const operator = payee.name ? `${payee.name}${payee.payeeInn ? `, ИНН ${payee.payeeInn}` : ""}` : `онлайн-школа ${SITE.name}`;
  const contact = [site.email, site.phone].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" aria-label="На главную">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ChevronLeft className="size-4" /> На главную
        </Link>
        <article className="space-y-4 rounded-xl border bg-surface p-6 text-[15px] leading-relaxed sm:p-8 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          <h1 className="text-2xl font-bold">Политика обработки персональных данных</h1>
          <p>
            Оператор персональных данных — {operator} (далее — школа). Политика действует в отношении данных, которые родители и ученики
            передают через сайт и при обучении.
          </p>

          <h2>Какие данные мы обрабатываем</h2>
          <ul>
            <li>имя ребёнка, класс, предмет и цель обучения;</li>
            <li>имя родителя или другого законного представителя, номер телефона;</li>
            <li>расписание, посещаемость и сведения об оплате занятий;</li>
            <li>идентификатор чата в Telegram, если родитель подключил бота школы.</li>
          </ul>

          <h2>Зачем</h2>
          <ul>
            <li>связаться по заявке и записать на пробный урок;</li>
            <li>организовать занятия, составить расписание и подобрать педагога;</li>
            <li>выставлять счета и принимать оплату, отправлять родителю расписание и напоминания.</li>
          </ul>

          <h2>Как храним и защищаем</h2>
          <p>
            Данные хранятся на серверах в России. Доступ есть только у сотрудников школы, которым он нужен для работы: педагог видит только
            своих учеников. Данные не передаются третьим лицам, кроме случаев, предусмотренных законом.
          </p>

          <h2>Сколько храним</h2>
          <p>
            Пока идёт обучение и затем столько, сколько требует законодательство (в том числе для учёта оплат). Данные заявки, которая не
            привела к занятиям, удаляются по запросу.
          </p>

          <h2>Ваши права</h2>
          <p>
            Вы можете узнать, какие данные о вас хранятся, попросить исправить или удалить их и отозвать согласие на обработку
            {contact ? `, написав или позвонив нам: ${contact}` : ", обратившись к администратору школы"}.
          </p>

          <h2>Согласие</h2>
          <p>
            Отправляя заявку на сайте, вы подтверждаете, что являетесь родителем или законным представителем ребёнка и соглашаетесь на
            обработку указанных данных для целей, перечисленных выше.
          </p>
        </article>
      </main>
    </div>
  );
}
