import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("задачи: просроченная в счётчике меню, новая задача, доска и выполнение", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByLabel(/просрочено: \d+/).first()).toBeVisible();

  await page.goto("/tasks");
  const overdue = page.getByRole("row", { name: /Позвонить маме Козлова Саши/ });
  await expect(overdue.getByText("Просрочена")).toBeVisible();

  await page.getByRole("button", { name: "Задача", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Новая задача" });
  await sheet.getByLabel("Что сделать").fill("Обзвонить родителей группы ОГЭ-9А");
  await sheet.getByLabel("Срок").fill("2030-01-15");
  await sheet.getByRole("button", { name: "Создать задачу" }).click();
  await expect(page.getByText("Задача создана")).toBeVisible();
  await expect(page.getByRole("row", { name: /Обзвонить родителей/ })).toBeVisible();

  // Доска: «В работе» через карточку, затем «Выполнена» и комментарий.
  await page.getByRole("tab", { name: /Доска/ }).click();
  await page.getByRole("region", { name: "Новые" }).getByText("Обзвонить родителей группы ОГЭ-9А").click();
  const card = page.getByRole("dialog", { name: "Обзвонить родителей группы ОГЭ-9А" });
  await card.getByLabel("Новый комментарий").fill("Начала с Беловых");
  await card.getByRole("button", { name: "Отправить" }).click();
  await expect(card.getByText("Начала с Беловых")).toBeVisible();
  await card.getByRole("button", { name: "В работе" }).click();
  await expect(page.getByText("Статус изменён")).toBeVisible();
  await page.keyboard.press("Escape"); // пока панель открыта, страница под ней скрыта от поиска по ролям
  await expect(page.getByRole("region", { name: "В работе" }).getByText("Обзвонить родителей группы ОГЭ-9А")).toBeVisible();

  // Перетаскивание на доске в «Выполнены».
  await page.getByRole("region", { name: "В работе" }).getByText("Обзвонить родителей группы ОГЭ-9А").dragTo(page.getByRole("region", { name: "Выполнены" }));
  await expect(page.getByRole("region", { name: "Выполнены" }).getByText("Обзвонить родителей группы ОГЭ-9А")).toBeVisible();
});

test("лид: касание → пробный → предложение → перевод в клиенты с историей", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/leads");
  await expect(page.getByText(/Всего \d+ · оплатили/)).toBeVisible();

  await page.getByRole("region", { name: "Новая заявка" }).getByText("Ершов Глеб").click();
  const sheet = page.getByRole("dialog", { name: "Ершов Глеб" });
  await sheet.getByLabel("Что обсудили").fill("Хочет ЕГЭ по информатике на 90+");
  await sheet.getByRole("button", { name: "Записать" }).click();
  await expect(page.getByText("Касание записано")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Связались", pressed: true })).toBeVisible();

  await sheet.getByRole("button", { name: "Назначить пробный урок" }).click();
  const trial = page.getByRole("dialog", { name: "Пробный урок" });
  await trial.getByLabel("Время").fill("13:30");
  await trial.getByRole("button", { name: "Назначить" }).click();
  await expect(page.getByText(/Пробный урок назначен/)).toBeVisible();
  await expect(sheet.getByText(/Пробный урок: \d{2}\.\d{2}\.\d{4} 13:30/)).toBeVisible();

  await sheet.getByRole("button", { name: "Рассчитать предложение" }).click();
  const offer = page.getByRole("dialog", { name: /Предложение для/ });
  await expect(offer.getByText(/Абонемент на месяц: .* = /)).toBeVisible();
  await offer.getByRole("button", { name: "Закрыть" }).first().click();

  await sheet.getByRole("button", { name: "Перевести в клиенты" }).click();
  const conv = page.getByRole("dialog", { name: "Перевести в клиенты" });
  await expect(conv.getByLabel("Фамилия и имя ученика")).toHaveValue("Глеб Ершов");
  await conv.getByLabel("Фамилия и имя ученика").fill("Ершов Глеб");
  await conv.getByRole("button", { name: "Создать ученика" }).click();
  await expect(page.getByRole("heading", { name: "Ершов Глеб" })).toBeVisible();
  await expect(page.getByText(/Пришёл из заявки · Сайт/)).toBeVisible();
  await expect(page.getByText("Хочет ЕГЭ по информатике на 90+")).toBeVisible();
});

test("владелец: расход и отчёт за месяц, выгрузка в Excel", async ({ page }) => {
  await login(page, "owner");
  await page.goto("/finance?tab=expenses");
  await page.getByRole("button", { name: "Расход", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Новый расход" });
  await dlg.getByLabel("Сумма, ₽").fill("3500");
  await dlg.getByLabel("Комментарий").fill("Тетради и маркеры");
  await dlg.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("Расход 3 500 ₽ добавлен")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Тетради и маркеры" })).toBeVisible();

  await page.goto("/finance?tab=reports");
  await expect(page.getByText("Прибыль", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Выручка и поступления по месяцам" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "По педагогам" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^report-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.goto("/finance?tab=reports&period=week");
  await expect(page.getByText("без надбавки — период короче месяца")).toBeVisible();
});

test("поиск в верхней панели: клиент и лид; педагог лидов не видит", async ({ page, browser }) => {
  await login(page, "admin");
  const search = page.getByRole("combobox", { name: "Поиск" });
  await search.fill("Козл");
  await expect(page.getByRole("option", { name: /Козлов Саша/ })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Козлов Саша" })).toBeVisible();

  await search.fill("Зайцева Даша");
  await expect(page.getByRole("option", { name: /Зайцева Даша.*лид/ })).toBeVisible();

  const ctx = await browser.newContext();
  const kim = await ctx.newPage();
  await login(kim, "kim");
  const s2 = kim.getByRole("combobox", { name: "Поиск" });
  await s2.fill("Зайцева");
  await expect(kim.getByText("Ничего не найдено")).toBeVisible();
  await kim.goto("/leads");
  await expect(kim).toHaveURL(/forbidden/);
  await ctx.close();
});
