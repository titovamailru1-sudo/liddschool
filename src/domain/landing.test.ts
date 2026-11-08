import { describe, expect, it } from "vitest";
import { landingJsonLd, landingPrices, telegramUrl, telUrl, whatsappUrl } from "./landing";
import { defaultTariffName, type TariffRow } from "./pricing";

const row = (kind: TariffRow["kind"], program: TariffRow["program"], paymentMode: TariffRow["paymentMode"], pricePerHour: number, validFrom = "2026-09-01"): TariffRow => ({
  tariffId: `${kind}-${program}-${paymentMode}`,
  name: defaultTariffName({ kind, program, paymentMode }),
  isDefault: true,
  kind,
  program,
  paymentMode,
  pricePerHour,
  validFrom,
});

const TARIFFS = [
  row("INDIVIDUAL", "EXAM", "MONTHLY", 1500),
  row("INDIVIDUAL", "EXAM", "PER_LESSON", 1700),
  row("INDIVIDUAL", "SCHOOL", "MONTHLY", 1300),
  row("INDIVIDUAL", "SCHOOL", "PER_LESSON", 1500),
  row("GROUP", "EXAM", "MONTHLY", 800),
  row("GROUP", "EXAM", "PER_LESSON", 1000),
  row("GROUP", "SCHOOL", "MONTHLY", 800),
  row("GROUP", "SCHOOL", "PER_LESSON", 1000),
  // Повышение с декабря — на главной до декабря не видно.
  row("INDIVIDUAL", "EXAM", "MONTHLY", 1600, "2026-12-01"),
];

describe("цены на главной", () => {
  it("тарифы школы на сегодня и выгода абонемента", () => {
    expect(landingPrices(TARIFFS, "2026-11-08")).toEqual({
      programs: [
        { program: "EXAM", monthly: 1500, perLesson: 1700, saving: 200 },
        { program: "SCHOOL", monthly: 1300, perLesson: 1500, saving: 200 },
      ],
      groupFrom: 800,
    });
    expect(landingPrices(TARIFFS, "2026-12-01").programs[0].monthly).toBe(1600);
  });

  it("нет тарифов — пустые цены, без ошибки", () => {
    expect(landingPrices([], "2026-11-08")).toEqual({ programs: [], groupFrom: null });
  });
});

describe("разметка для поисковиков", () => {
  it("школа с услугами и ценами, вопросы-ответы", () => {
    const [org, faq] = landingJsonLd({
      url: "https://liddschool.ru",
      name: "Lidd School",
      description: "Онлайн-школа",
      prices: landingPrices(TARIFFS, "2026-11-08"),
      faq: [{ q: "Пробный урок платный?", a: "Нет, бесплатный." }],
      phone: "+7 914 000-00-00",
    });
    expect(org).toMatchObject({ "@type": "EducationalOrganization", telephone: "+7 914 000-00-00" });
    expect(org).not.toHaveProperty("email");
    expect(org).not.toHaveProperty("employee");
    expect(org).not.toHaveProperty("review");
    const offers = (org as { hasOfferCatalog: { itemListElement: { price: number }[] } }).hasOfferCatalog.itemListElement;
    expect(offers.map((o) => o.price)).toEqual([1500, 1300, 800]);
    expect(faq).toMatchObject({ "@type": "FAQPage", mainEntity: [{ name: "Пробный урок платный?", acceptedAnswer: { text: "Нет, бесплатный." } }] });
  });
});

describe("педагоги и отзывы в разметке", () => {
  it("педагоги — сотрудники школы, отзывы — Review", () => {
    const [org] = landingJsonLd({
      url: "https://liddschool.ru",
      name: "Lidd School",
      description: "",
      prices: { programs: [], groupFrom: null },
      faq: [],
      teachers: [{ name: "Алёна", jobTitle: "Педагог по математике", description: "86 баллов", image: "https://liddschool.ru/teachers/alena.webp" }],
      reviews: [{ author: "Ольга", text: "Спасибо!" }],
    });
    expect(org).toMatchObject({
      employee: [{ "@type": "Person", name: "Алёна", image: "https://liddschool.ru/teachers/alena.webp" }],
      review: [{ "@type": "Review", author: { name: "Ольга" }, reviewBody: "Спасибо!" }],
    });
  });
});

describe("ссылки на контакты", () => {
  it.each([
    ["liddschool", "https://t.me/liddschool"],
    ["@liddschool", "https://t.me/liddschool"],
    ["t.me/liddschool", "https://t.me/liddschool"],
    ["https://t.me/liddschool", "https://t.me/liddschool"],
  ])("Telegram %s", (v, url) => expect(telegramUrl(v)).toBe(url));

  it("WhatsApp и телефон", () => {
    expect(whatsappUrl("8 (914) 000-00-01")).toBe("https://wa.me/79140000001");
    expect(whatsappUrl("+7 914 000-00-01")).toBe("https://wa.me/79140000001");
    expect(telUrl("+7 (914) 000-00-01")).toBe("tel:+79140000001");
  });
});
