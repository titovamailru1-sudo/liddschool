import { expect, test } from "@playwright/test";
import { addDays, firstOfMonth, localDateOf, parseLocalDate } from "../src/domain/calendar";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

const today = localDateOf(new Date());
const { year, month } = parseLocalDate(today);
const prevMonth = addDays(firstOfMonth(year, month), -1).slice(0, 7);

test("владелец: ведомость — премия и аванс, закрытие прошлого месяца", async ({ page }) => {
  await login(page, "owner");
  await page.goto("/finance?tab=payroll");
  await expect(page.getByRole("columnheader", { name: "К выплате" })).toBeVisible();

  // Ким: премия из сид-данных видна в раскрытой строке.
  await page.getByRole("row", { name: /Ким Денис/ }).click();
  await expect(page.getByText("Подготовка к олимпиаде по информатике")).toBeVisible();

  // Петрова: премия и аванс.
  await page.getByRole("row", { name: /Ким Денис/ }).click();
  await page.getByRole("row", { name: /Петрова Анна/ }).click();
  await page.getByRole("button", { name: "Премия" }).click();
  const bonus = page.getByRole("dialog", { name: "Премия" });
  await bonus.getByLabel("Сумма, ₽").fill("1000");
  await bonus.getByLabel("Причина").fill("Открытый урок для родителей");
  await bonus.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Премия 1 000 ₽ добавлена")).toBeVisible();
  await expect(page.getByText("Открытый урок для родителей")).toBeVisible();

  // Прошлый месяц завершён — его можно закрыть.
  await page.goto(`/finance?tab=payroll&month=${prevMonth}`);
  await page.getByRole("button", { name: /Закрыть месяц для всех/ }).click();
  await expect(page.getByText(/Месяц закрыт: \d+/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Закрыть месяц для всех/ })).toHaveCount(0);
});

test("владелец: изменение шаблона ставки действует с 1-го числа следующего месяца", async ({ page }) => {
  await login(page, "owner");
  await page.goto("/teachers/rates");
  await page.getByRole("button", { name: "Изменить" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Изменить шаблон" });
  await dlg.getByLabel("₽ за урок-час").fill("750");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Новая ставка действует с 01\.\d{2}\.\d{4}/)).toBeVisible();
  await expect(page.getByText(/750 ₽/).first()).toBeVisible();

  // Текущий месяц у педагога — по прежней ставке.
  await page.goto("/teachers");
  await page.getByRole("link", { name: "Петрова Анна" }).click();
  await page.getByRole("link", { name: "Ставка и надбавки" }).click();
  await expect(page.getByText(/Действует сейчас/)).toBeVisible();
  await expect(page.getByText("700 ₽").first()).toBeVisible();
  await expect(page.getByText(/^С 01\.\d{2}\.\d{4}/)).toBeVisible();
});

test("администратор добавляет педагога без доступа к ставкам; педагог входит по приглашению и видит «Мой заработок»", async ({ page, browser }) => {
  await login(page, "admin");
  await page.goto("/teachers");
  await expect(page.getByRole("columnheader", { name: "Начислено" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Шаблоны ставок" })).toHaveCount(0);

  await page.getByRole("button", { name: "Педагог" }).click();
  const sheet = page.getByRole("dialog", { name: "Новый педагог" });
  await sheet.getByLabel("Фамилия и имя").fill("Смирнов Олег");
  await sheet.getByLabel("Email для входа").fill("smirnov@lidd.school");
  await sheet.getByLabel("Предметы (через запятую)").fill("математика, ЕГЭ");
  await sheet.getByRole("button", { name: "Добавить педагога" }).click();
  const link = await sheet.locator("code").innerText();
  expect(link).toMatch(/\/invite\/[\w-]+$/);

  await page.goto("/teachers/rates");
  await expect(page).toHaveURL(/forbidden/);

  const ctx = await browser.newContext();
  const t = await ctx.newPage();
  await t.goto(link);
  await expect(t.getByText("Здравствуйте, Смирнов Олег!")).toBeVisible();
  await t.getByLabel("Пароль", { exact: true }).fill("пароль-смирнова");
  await t.getByLabel("Повторите пароль").fill("пароль-смирнова");
  await t.getByRole("button", { name: /Сохранить и перейти ко входу/ }).click();
  await expect(t.getByText("Пароль сохранён — войдите с ним.")).toBeVisible();
  await t.getByLabel("Email").fill("smirnov@lidd.school");
  await t.getByLabel("Пароль").fill("пароль-смирнова");
  await t.getByRole("button", { name: "Войти" }).click();
  await expect(t).toHaveURL(/lessons/);
  await t.goto("/finance");
  await expect(t.getByRole("link", { name: "Мой заработок" })).toBeVisible();
  await expect(t.getByText("Начислено на сегодня")).toBeVisible();

  // Ссылка одноразовая.
  await t.goto(link);
  await expect(t.getByText("Ссылка недействительна")).toBeVisible();
  await ctx.close();
});

test("педагог: «Мой заработок» — свои уроки, премия, шкала; без кнопок управления", async ({ page }) => {
  await login(page, "kim");
  await page.goto("/finance");
  await expect(page.getByText("Начислено на сегодня")).toBeVisible();
  await expect(page.getByText("Подготовка к олимпиаде по информатике")).toBeVisible();
  await expect(page.getByText(/Часы за месяц/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Премия" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Закрыть месяц/ })).toHaveCount(0);

  await page.goto("/finance?tab=payroll");
  await expect(page.getByRole("columnheader", { name: "К выплате" })).toHaveCount(0); // чужие зарплаты не видны
});
