import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("главная: описание школы, цены из тарифов, «Войти»; CRM закрыта от поисковиков", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Репетитор по математике и информатике онлайн/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Репетиторы по математике и информатике онлайн");
  await expect(page.getByRole("region", { name: "Стоимость занятий" })).toContainText("1 500 ₽");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");

  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "[]");
  expect(ld.map((x: { "@type": string }) => x["@type"])).toEqual(["EducationalOrganization", "FAQPage"]);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  expect(robots).toContain("Allow: /$");

  await page.getByRole("link", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("заявка на пробный урок с главной → лид «Сайт» и задача администратору", async ({ page, browser }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Заявка на пробный урок" });
  await form.getByLabel("Имя ребёнка").fill("Тестов Петя");
  await form.getByLabel("Класс").click();
  await page.getByRole("option", { name: "9", exact: true }).click();
  await form.getByLabel("Ваше имя").fill("Тестова Анна");
  await form.getByLabel("Телефон").fill("+7 914 123-45-67");
  // Защита от ботов: форму быстрее 3 секунд не принимаем.
  await page.waitForTimeout(3_100);
  await expect(form.getByRole("button", { name: "Записаться на бесплатный урок" })).toBeDisabled();
  await form.getByLabel("Согласие на обработку персональных данных").click();
  await form.getByRole("button", { name: "Записаться на бесплатный урок" }).click();
  await expect(page.getByRole("status")).toContainText("Заявка отправлена");

  const admin = await browser.newPage();
  await login(admin, "admin");
  await admin.goto("/leads");
  await expect(admin.getByText("Тестов Петя").first()).toBeVisible();
  await admin.goto("/tasks");
  await expect(admin.getByText("Новая заявка с сайта: Тестов Петя").first()).toBeVisible();
});
