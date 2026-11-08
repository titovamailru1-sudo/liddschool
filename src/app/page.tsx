import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Gift,
  GraduationCap,
  Laptop,
  LogIn,
  Mail,
  MessageCircle,
  Phone,
  Quote,
  Send,
  Sigma,
  Code2,
  Users,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { localDateOf } from "@/domain/calendar";
import { formatRub } from "@/domain/format";
import { landingJsonLd, landingPrices, telegramUrl, telUrl, whatsappUrl, type Faq } from "@/domain/landing";
import { SITE_REVIEWS, visibleReviews } from "@/content/reviews";
import { SITE_TEACHERS } from "@/content/teachers";
import { SITE, siteUrl } from "@/lib/site";
import { auth } from "@/server/auth";
import { loadSettings } from "@/server/billing/settings";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { loadTariffs } from "@/server/lessons/context";
import { ContactLink } from "./_landing/contact-link";
import { Metrika } from "./_landing/metrika";
import { TrialForm } from "./_landing/trial-form";

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE.name,
    title: "Математика и информатика онлайн: ОГЭ, ЕГЭ и школьная программа",
    description: SITE.description,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Lidd School — математика и информатика онлайн" }],
  },
  twitter: { card: "summary_large_image" },
};

const PROGRAM_LABEL = { EXAM: "ОГЭ и ЕГЭ", SCHOOL: "Школьная программа" } as const;

export default async function HomePage() {
  const today = localDateOf(now());
  const [tariffs, settings, session] = await Promise.all([loadTariffs(prisma), loadSettings(prisma), auth()]);
  const prices = landingPrices(tariffs, today);
  const site = settings.site;
  const minPrice = Math.min(...prices.programs.map((p) => p.monthly), prices.groupFrom ?? Infinity);

  const faq: Faq[] = [
    {
      q: "Пробный урок платный?",
      a: "Нет, первый урок бесплатный. Педагог знакомится с учеником, смотрит уровень и вместе с вами определяет цели и план занятий.",
    },
    {
      q: "Как проходят онлайн-занятия?",
      a:
        "По видеосвязи: у каждого педагога постоянная ссылка на занятие. Педагог показывает онлайн-доску и даёт к ней доступ по ссылке — конспект всегда под рукой, " +
        "переписывать всё не обязательно. Дальше вместе решаем типовые задания. Нужны компьютер или планшет, наушники и стабильный интернет.",
    },
    {
      q: "Как оплачивать занятия?",
      a:
        "Есть два варианта. Абонемент на месяц: в конце месяца родитель получает расписание на следующий месяц и счёт, оплатить нужно до 1-го числа. " +
        `Поурочно: ссылка на оплату приходит за ${settings.perLessonLinkHours} часа до урока. Оплата — по QR-коду или реквизитам в банковском приложении.`,
    },
    {
      q: "Что будет, если пропустить урок?",
      a: "Если предупредить хотя бы за 24 часа, пропуск уважительный: по абонементу стоимость урока вычитается из следующего счёта. Если предупредить позже или не прийти, урок считается проведённым.",
    },
    {
      q: "Сколько стоит обучение?",
      a: prices.programs.length
        ? prices.programs.map((p) => `${PROGRAM_LABEL[p.program]}: ${formatRub(p.monthly)} за час по абонементу или ${formatRub(p.perLesson)} поурочно`).join("; ") +
          (prices.groupFrom !== null ? `; групповые занятия — от ${formatRub(prices.groupFrom)} за час.` : ".") +
          " Урок 90 минут — это полтора часа."
        : "Стоимость зависит от программы и формата — уточните на пробном уроке.",
    },
    {
      q: "Можно заниматься в группе?",
      a: "Да, кроме индивидуальных занятий есть групповые — они дешевле. Подходящую группу подберём после пробного урока.",
    },
  ];

  const jsonLd = landingJsonLd({
    url: siteUrl(),
    name: SITE.name,
    description: SITE.description,
    prices,
    faq,
    phone: site.phone,
    email: site.email,
    sameAs: site.telegram ? [telegramUrl(site.telegram)] : undefined,
    teachers: SITE_TEACHERS.map((t) => ({ name: t.name, jobTitle: `Педагог: ${t.subjects}`, description: [...t.facts, t.about].join(". "), image: `${siteUrl()}${t.photo}` })),
    reviews: SITE_REVIEWS.filter((r) => !r.example),
  });
  const reviews = visibleReviews();
  const contacts = [
    site.phone && { href: telUrl(site.phone), label: site.phone, icon: Phone },
    site.telegram && { href: telegramUrl(site.telegram), label: "Telegram", icon: Send },
    site.whatsapp && { href: whatsappUrl(site.whatsapp), label: "WhatsApp", icon: MessageCircle },
    site.email && { href: `mailto:${site.email}`, label: site.email, icon: Mail },
  ].filter((c): c is { href: string; label: string; icon: typeof Phone } => !!c);
  const metrikaId = process.env.YANDEX_METRIKA_ID;

  return (
    <div className="min-h-screen bg-canvas text-text-primary" data-ym={metrikaId}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {metrikaId && <Metrika id={metrikaId} />}

      {/* Шапка */}
      <header className="sticky top-0 z-30 border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1152px] items-center gap-6 px-4 md:px-6">
          <Link href="/" aria-label="Lidd School — на главную">
            <Logo />
          </Link>
          <nav className="hidden gap-5 text-sm text-text-secondary md:flex" aria-label="Разделы">
            <a href="#programs" className="hover:text-text-primary">Программы</a>
            <a href="#teachers" className="hover:text-text-primary">Педагоги</a>
            <a href="#how" className="hover:text-text-primary">Как проходят занятия</a>
            <a href="#prices" className="hover:text-text-primary">Цены</a>
            <a href="#faq" className="hover:text-text-primary">Вопросы</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href={session?.user ? "/lessons" : "/login"}>
                <LogIn /> {session?.user ? "Открыть CRM" : "Войти"}
              </Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <a href="#trial">Пробный урок</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Первый экран */}
        <section className="bg-gradient-to-b from-brand-soft to-canvas">
          <div className="mx-auto grid max-w-[1152px] items-center gap-10 px-4 py-14 md:grid-cols-[1.15fr_1fr] md:px-6 md:py-20">
            <div>
              <p className="mb-3 text-sm font-semibold text-brand-text">Онлайн-школа {SITE.name}</p>
              <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl lg:text-[44px]">
                Репетиторы по математике и информатике онлайн
              </h1>
              <p className="mt-4 max-w-xl text-lg text-text-secondary">
                Подготовка к ОГЭ и ЕГЭ и помощь со школьной программой. Индивидуально или в группе — из любого города.
              </p>
              <ul className="mt-6 space-y-2 text-[15px]">
                {["Первый урок — бесплатно", "Абонемент на месяц выгоднее, чем оплата за каждый урок", "Расписание и счёт на месяц — родителю в Telegram"].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-5 shrink-0 text-done" /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <a href="#trial">
                    Записаться на пробный урок <ArrowRight />
                  </a>
                </Button>
                {Number.isFinite(minPrice) && (
                  <Button size="lg" variant="outline" asChild>
                    <a href="#prices">Цены от {formatRub(minPrice)} за час</a>
                  </Button>
                )}
              </div>
            </div>
            <WeekCard />
          </div>
        </section>

        {/* Преимущества */}
        <section aria-labelledby="why" className="mx-auto max-w-[1152px] px-4 py-14 md:px-6">
          <h2 id="why" className="sr-only">Почему Lidd School</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Gift, title: "Бесплатный пробный урок", text: "Знакомимся, проверяем уровень и составляем план без оплаты." },
              { icon: Laptop, title: "Полностью онлайн", text: "Постоянная ссылка на занятие — не нужно никуда ездить." },
              { icon: Users, title: "Индивидуально и в группах", text: "Выберите формат и темп, которые подходят ребёнку." },
              { icon: CalendarCheck, title: "Понятная оплата", text: "Абонемент по расписанию на месяц или оплата за каждый урок." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border bg-surface p-5">
                <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Программы */}
        <section id="programs" aria-labelledby="programs-h" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-[1152px] px-4 py-14 md:px-6">
            <h2 id="programs-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Программы</h2>
            <p className="mt-2 max-w-2xl text-text-secondary">Математика и информатика для школьников: подготовка к экзаменам и уверенность в текущих темах.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Program
                icon={GraduationCap}
                title="Подготовка к ОГЭ и ЕГЭ"
                text="Разбираем задания экзамена по темам, решаем варианты и закрываем пробелы, которые мешают набрать нужный балл."
                items={["Математика: ОГЭ и ЕГЭ", "Информатика: ОГЭ и ЕГЭ, включая задачи на программирование", "За год — все типы заданий из открытого банка ФИПИ", "Решение вариантов и разбор ошибок"]}
              />
              <Program
                icon={Sigma}
                title="Школьная программа"
                text="Помогаем разобраться в текущих темах, подтянуть оценки и не отставать от класса."
                items={["Математика: алгебра и геометрия", "Информатика и основы программирования", "Объясняем пропущенное и непонятое"]}
              />
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
              <Code2 className="size-4" /> Предмет и цель можно указать в заявке — педагога подберём под них.
            </p>
          </div>
        </section>

        {/* Педагоги */}
        <section id="teachers" aria-labelledby="teachers-h" className="mx-auto max-w-[1152px] scroll-mt-20 px-4 py-14 md:px-6">
          <h2 id="teachers-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Педагоги</h2>
          <p className="mt-2 max-w-2xl text-text-secondary">
            Студенты-отличники направлений прикладной математики и информатики: сами недавно сдавали экзамены и знают, где ученики теряют баллы.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SITE_TEACHERS.map((t) => (
              <article key={t.name} className="flex flex-col rounded-xl border bg-surface p-5">
                <div className="flex items-center gap-4">
                  <Image src={t.photo} alt={`${t.name}, педагог Lidd School`} width={88} height={88} className="size-[88px] shrink-0 rounded-full object-cover" />
                  <div>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="text-sm text-brand-text">{t.subjects}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm font-medium">
                  {t.facts.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-done" /> {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-text-secondary">{t.about}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-text-secondary">Педагога подбираем на пробном уроке — под предмет, цель и характер ребёнка.</p>
        </section>

        {/* Как проходят занятия */}
        <section id="how" aria-labelledby="how-h" className="mx-auto max-w-[1152px] scroll-mt-20 px-4 py-14 md:px-6">
          <h2 id="how-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Как проходят занятия</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              ["Заявка", "Оставьте заявку — мы перезвоним и подберём время пробного урока."],
              ["Пробный урок", "Бесплатно: знакомство с педагогом, проверка уровня, цели и план."],
              ["Расписание", "Выбираете дни и время, формат и способ оплаты: абонемент или поурочно."],
              ["Занятия онлайн", "Педагог объясняет теорию на онлайн-доске (доступ по ссылке), затем вместе решаете типовые задания."],
            ].map(([title, text], i) => (
              <li key={title} className="rounded-xl border bg-surface p-5">
                <span className="text-sm font-semibold text-brand-text">Шаг {i + 1}</span>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Цены */}
        {prices.programs.length > 0 && (
          <section id="prices" aria-labelledby="prices-h" className="scroll-mt-20 bg-surface">
            <div className="mx-auto max-w-[1152px] px-4 py-14 md:px-6">
              <h2 id="prices-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Стоимость занятий</h2>
              <p className="mt-2 text-text-secondary">Цена за урок-час (60 минут). Урок 45 минут — 0,75 часа, 90 минут — 1,5 часа.</p>
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {prices.programs.map((p) => (
                  <div key={p.program} className="rounded-xl border p-6">
                    <h3 className="text-lg font-semibold">{PROGRAM_LABEL[p.program]}</h3>
                    <p className="text-sm text-text-secondary">Индивидуальные занятия</p>
                    <div className="mt-5 flex items-end gap-2">
                      <span className="text-3xl font-bold tabular-nums">{formatRub(p.monthly)}</span>
                      <span className="pb-1 text-sm text-text-secondary">за час по абонементу</span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">
                      Поурочно — {formatRub(p.perLesson)} за час
                      {p.saving > 0 && <span className="ml-2 rounded bg-done-soft px-1.5 py-0.5 text-done">абонемент выгоднее на {formatRub(p.saving)} в час</span>}
                    </p>
                  </div>
                ))}
              </div>
              {prices.groupFrom !== null && (
                <p className="mt-4 rounded-xl bg-brand-soft px-5 py-4 text-sm">
                  <b>Групповые занятия</b> — от {formatRub(prices.groupFrom)} за час.
                </p>
              )}
              <p className="mt-4 text-sm text-text-secondary">
                Абонемент считается по вашему расписанию на месяц: столько уроков, сколько их в календаре. Пробный урок — бесплатно.
              </p>
            </div>
          </section>
        )}

        {/* Отзывы — только настоящие; примеры видны лишь при разработке (src/content/reviews.ts) */}
        {reviews.length > 0 && (
          <section id="reviews" aria-labelledby="reviews-h" className="mx-auto max-w-[1152px] scroll-mt-20 px-4 pt-14 md:px-6">
            <h2 id="reviews-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Отзывы родителей</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {reviews.map((r) => (
                <figure key={r.author + r.text} className="relative flex flex-col rounded-xl border bg-surface p-5">
                  {r.example && (
                    <span className="absolute top-3 right-3 rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">Пример — заменить</span>
                  )}
                  <Quote className="size-6 text-brand/40" />
                  <blockquote className="mt-2 flex-1 text-[15px]">{r.text}</blockquote>
                  {r.result && <p className="mt-3 text-sm font-semibold text-done">{r.result}</p>}
                  <figcaption className="mt-2 text-sm text-text-secondary">{r.author}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Вопросы */}
        <section id="faq" aria-labelledby="faq-h" className="mx-auto max-w-[1152px] scroll-mt-20 px-4 py-14 md:px-6">
          <h2 id="faq-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Частые вопросы</h2>
          <div className="mt-6 divide-y rounded-xl border bg-surface">
            {faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  <h3>{f.q}</h3>
                  <span className="text-xl text-text-secondary transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-text-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Заявка */}
        <section id="trial" aria-labelledby="trial-h" className="scroll-mt-20 bg-gradient-to-b from-canvas to-brand-soft">
          <div className="mx-auto grid max-w-[1152px] gap-10 px-4 py-14 md:grid-cols-[1fr_1.1fr] md:px-6">
            <div>
              <h2 id="trial-h" className="text-2xl font-bold tracking-tight sm:text-3xl">Запишитесь на бесплатный пробный урок</h2>
              <p className="mt-3 text-text-secondary">Оставьте заявку — перезвоним, ответим на вопросы и подберём педагога и время.</p>
              {contacts.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-sm font-medium">Или свяжитесь с нами:</p>
                  {contacts.map((c) => (
                    <ContactLink key={c.href} href={c.href} className="flex items-center gap-2 text-brand-text hover:underline">
                      <c.icon className="size-4" /> {c.label}
                    </ContactLink>
                  ))}
                </div>
              )}
            </div>
            <TrialForm />
          </div>
        </section>
      </main>

      <footer className="border-t bg-surface">
        <div className="mx-auto flex max-w-[1152px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-text-secondary md:px-6">
          <span>© {new Date().getFullYear()} {SITE.name} — онлайн-школа математики и информатики</span>
          <Link href="/privacy" className="hover:text-text-primary">Политика конфиденциальности</Link>
          <Link href="/login" className="ml-auto hover:text-text-primary">Вход для сотрудников</Link>
        </div>
      </footer>
    </div>
  );
}

function Program({ icon: Icon, title, text, items }: { icon: typeof Sigma; title: string; text: string; items: string[] }) {
  return (
    <article className="rounded-xl border p-6">
      <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
        <Icon className="size-5" />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{text}</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-done" /> {i}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Иллюстрация первого экрана: так выглядит неделя ученика (декоративная, без реальных данных). */
function WeekCard() {
  const rows = [
    { day: "Пн", time: "16:00", title: "Математика · ЕГЭ", note: "Задание 13: тригонометрия", color: "var(--teacher-1)" },
    { day: "Ср", time: "17:30", title: "Информатика · ОГЭ", note: "Алгоритмы и Python", color: "var(--teacher-2)" },
    { day: "Пт", time: "16:00", title: "Математика · ЕГЭ", note: "Пробный вариант", color: "var(--teacher-1)" },
  ];
  return (
    <div aria-hidden className="mx-auto w-full max-w-md rounded-2xl border bg-surface p-5 shadow-[0_20px_60px_-30px_rgba(91,95,214,0.45)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-semibold">Расписание на неделю</span>
        <span className="rounded bg-done-soft px-2 py-0.5 text-xs font-medium text-done">Абонемент оплачен</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.day} className="flex items-center gap-3 rounded-lg border border-l-4 px-3 py-2.5" style={{ borderLeftColor: r.color }}>
            <div className="w-10 text-center leading-tight">
              <div className="text-xs text-text-secondary">{r.day}</div>
              <div className="text-sm font-semibold tabular-nums">{r.time}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="truncate text-xs text-text-secondary">{r.note}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-text-secondary">Занятия онлайн по ссылке педагога</p>
    </div>
  );
}
