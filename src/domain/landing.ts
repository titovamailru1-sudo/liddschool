import type { LocalDate } from "./calendar";
import type { Program } from "./constants";
import { tariffOn, type TariffRow } from "./pricing";

/** Цены на главной: тарифы школы на сегодня за урок-час. */
export interface LandingPrices {
  programs: { program: Program; monthly: number; perLesson: number; saving: number }[];
  groupFrom: number | null; // самый дешёвый групповой урок-час
}

export function landingPrices(tariffs: readonly TariffRow[], today: LocalDate): LandingPrices {
  const price = (kind: "INDIVIDUAL" | "GROUP", program: Program, paymentMode: "MONTHLY" | "PER_LESSON") => {
    try {
      return tariffOn(tariffs, { kind, program, paymentMode }, today).pricePerHour;
    } catch {
      return null;
    }
  };
  const programs: LandingPrices["programs"] = [];
  for (const program of ["EXAM", "SCHOOL"] as const) {
    const monthly = price("INDIVIDUAL", program, "MONTHLY");
    const perLesson = price("INDIVIDUAL", program, "PER_LESSON");
    if (monthly !== null && perLesson !== null) programs.push({ program, monthly, perLesson, saving: perLesson - monthly });
  }
  const groups = (["EXAM", "SCHOOL"] as const).flatMap((p) => [price("GROUP", p, "MONTHLY"), price("GROUP", p, "PER_LESSON")]).filter((x) => x !== null);
  return { programs, groupFrom: groups.length ? Math.min(...groups) : null };
}

export interface Faq {
  q: string;
  a: string;
}

/**
 * Разметка schema.org для поисковиков: школа, её услуги с ценами и вопросы-ответы.
 * Цены — те же, что видит посетитель (иначе Яндекс и Google снижают доверие к разметке).
 */
export function landingJsonLd(input: { url: string; name: string; description: string; prices: LandingPrices; faq: readonly Faq[]; phone?: string; email?: string; sameAs?: string[] }) {
  const PROGRAM_NAME: Record<Program, string> = { EXAM: "Подготовка к ОГЭ и ЕГЭ", SCHOOL: "Школьная программа" };
  const offers = input.prices.programs.map((p) => ({
    "@type": "Offer",
    name: `${PROGRAM_NAME[p.program]}: математика и информатика онлайн`,
    priceCurrency: "RUB",
    price: p.monthly,
    priceSpecification: { "@type": "UnitPriceSpecification", price: p.monthly, priceCurrency: "RUB", unitText: "урок-час (абонемент)" },
  }));
  if (input.prices.groupFrom !== null) {
    offers.push({
      "@type": "Offer",
      name: "Групповые занятия онлайн",
      priceCurrency: "RUB",
      price: input.prices.groupFrom,
      priceSpecification: { "@type": "UnitPriceSpecification", price: input.prices.groupFrom, priceCurrency: "RUB", unitText: "урок-час" },
    });
  }
  return [
    {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: input.name,
      url: input.url,
      description: input.description,
      ...(input.phone ? { telephone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
      areaServed: { "@type": "Country", name: "Россия" },
      hasOfferCatalog: { "@type": "OfferCatalog", name: "Занятия", itemListElement: offers },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: input.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
}

/** Ссылка на Telegram из имени, «@имени» или готовой ссылки. */
export function telegramUrl(v: string): string {
  const t = v.trim();
  if (/^https?:\/\//.test(t)) return t;
  return `https://t.me/${t.replace(/^@/, "").replace(/^t\.me\//, "")}`;
}

/** Ссылка WhatsApp из номера в любом формате (8… → 7…). */
export function whatsappUrl(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d}`;
}

/** tel:-ссылка: только цифры и «+». */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
