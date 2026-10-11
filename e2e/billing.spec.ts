import { expect, test } from "@playwright/test";
import { addDays, lastOfMonth, localDateOf, parseLocalDate } from "../src/domain/calendar";
import { balanceOf, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const today = localDateOf(new Date());
const { year, month } = parseLocalDate(today);
const nextMonth = addDays(lastOfMonth(year, month), 1).slice(0, 7);

test("долг абонементщика: «Долги» → карточка → принять оплату → баланс 0, счёт оплачен", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/finance?tab=debts");
  await expect(page.getByRole("link", { name: "Козлов Саша" })).toBeVisible();
  await page.getByRole("link", { name: "Козлов Саша" }).click();
  await page.getByRole("link", { name: "Счета" }).click();
  await expect(page.locator("tbody").getByText("Долг", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Принять оплату" }).click();
  const dlg = page.getByRole("dialog", { name: "Принять оплату" });
  await expect(dlg.getByLabel("Сумма, ₽")).not.toHaveValue("");
  await dlg.getByRole("button", { name: "Принять" }).click();
  await expect(page.getByText(/Оплата .* принята\. Баланс: 0/)).toBeVisible();

  expect(await balanceOf(page, "Козлов Саша")).toBe(0);
  await page.getByRole("link", { name: "Счета" }).click();
  await expect(page.locator("tbody").getByText("Оплачено", { exact: true })).toBeVisible();

  await page.goto("/finance?tab=debts");
  await expect(page.getByRole("link", { name: "Козлов Саша" })).toHaveCount(0);
});

test("абонементы следующего месяца: черновики → предпросмотр → отправка после проверки", async ({ page }) => {
  await login(page, "admin");
  await page.goto(`/subscriptions?month=${nextMonth}`);
  await page.getByRole("button", { name: "Сформировать черновики" }).click();
  await expect(page.getByText(/Черновиков: \d+/)).toBeVisible();
  const row = page.getByRole("row", { name: /Иванов Миша/ });
  await expect(row.getByText("Черновик")).toBeVisible();

  await row.getByRole("button", { name: /Просмотр/ }).click();
  const preview = page.getByRole("dialog", { name: "Иванов Миша" });
  await expect(preview.getByText(/Здравствуйте, Ольга Петровна! В .* у Миши Иванова/)).toBeVisible();
  await expect(preview.getByText(/Итого к оплате/)).toBeVisible();
  await preview.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText(/Выставлено счетов: 1/)).toBeVisible();
  await expect(row.getByText("Ожидается")).toBeVisible(); // месяц ещё не начался — не списан
});

test("новый ученик, приглашение родителя в Telegram, страница оплаты без входа", async ({ page, browser }) => {
  await login(page, "admin");
  await page.goto("/clients");
  await page.getByRole("button", { name: "Ученик" }).click();
  const sheet = page.getByRole("dialog", { name: "Новый ученик" });
  await sheet.getByLabel("Фамилия и имя ученика").fill("Зайцев Лёва");
  await sheet.getByLabel("Пол").click();
  await page.getByRole("option", { name: "Мужской" }).click();
  await sheet.getByLabel("ФИО родителя").fill("Зайцева Мария Ивановна");
  await sheet.getByLabel("Телефон родителя").fill("+7 914 111-22-33");
  await expect(sheet.getByText("«Лёвы Зайцева»")).toBeVisible(); // автосклонение
  await sheet.getByRole("button", { name: "Добавить ученика" }).click();
  await expect(page.getByRole("heading", { name: "Зайцев Лёва" })).toBeVisible();

  await page.getByRole("button", { name: "Пригласить в Telegram" }).click();
  await expect(page.getByText(/t\.me\/lidd_school_test_bot\?start=/)).toBeVisible();

  // Страница оплаты по ссылке из счёта — открывается без входа и показывает QR.
  await page.goto("/clients");
  await page.getByRole("link", { name: "Иванов Миша" }).click();
  await page.getByRole("link", { name: "Счета" }).click();
  const href = await page.getByRole("link", { name: "Страница оплаты" }).first().getAttribute("href");
  const anon = await browser.newContext();
  const pay = await anon.newPage();
  await pay.goto(href!);
  await expect(pay.getByText(/Абонемент Миша И\./).first()).toBeVisible();
  await expect(pay.getByAltText(/QR-код для оплаты/).or(pay.getByText("Оплачено. Спасибо!"))).toBeVisible();
  await expect(pay.getByText("Иванов Миша")).toHaveCount(0); // полное ФИО не раскрываем
  await anon.close();
});

test("журнал платежей: итог за период и отмена ошибочного платежа", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/finance?tab=payments");
  await expect(page.getByText(/За период .*:/)).toBeVisible();
  const row = page.getByRole("row", { name: /Козлов Саша/ }).first();
  await row.getByRole("button", { name: "Отменить платёж" }).click();
  const dlg = page.getByRole("dialog", { name: /Отменить платёж/ });
  await dlg.getByLabel("Причина").fill("тест: ошиблись суммой");
  await dlg.getByRole("button", { name: "Отменить платёж" }).click();
  await expect(page.getByText(/Платёж отменён/)).toBeVisible();
  expect(await balanceOf(page, "Козлов Саша")).toBeLessThan(0);
});

test("администратор не видит настройки; владелец видит реквизиты и статус бота", async ({ page, browser }) => {
  await login(page, "admin");
  await page.goto("/settings");
  await expect(page).toHaveURL(/forbidden/);

  // Владелец — в отдельном контексте браузера (фоновые запросы страницы могут вернуть cookie сессии).
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await login(owner, "owner");
  await owner.goto("/settings");
  await expect(owner.getByText("Режим заглушки")).toBeVisible();
  await expect(owner.getByLabel("БИК")).toHaveValue("040500000");
  await ctx.close();
});
