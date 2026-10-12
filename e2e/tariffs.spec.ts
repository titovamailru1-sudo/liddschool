import { expect, test } from "@playwright/test";
import { addDays, localDateOf } from "../src/domain/calendar";
import { formatLocalDate } from "../src/domain/format";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("владелец: свой тариф, новая цена с даты, выбор тарифа ученику, запрет удаления", async ({ page }) => {
  await login(page, "owner");
  await page.goto("/subscriptions");
  await page.getByRole("link", { name: "Тарифы" }).click();
  await expect(page.getByRole("heading", { name: "Тарифы", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /ОГЭ\/ЕГЭ · индивидуально · абонемент/ })).toContainText("1 500 ₽");

  // Новый тариф
  await page.getByRole("button", { name: "Тариф", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Новый тариф" });
  await sheet.getByLabel("Название").fill("Семейный ЕГЭ");
  await sheet.getByLabel("Цена за урок-час, ₽").fill("1400");
  await sheet.getByRole("button", { name: "Создать тариф" }).click();
  await expect(page.getByText("Тариф «Семейный ЕГЭ» создан")).toBeVisible();
  const row = page.getByRole("row", { name: /Семейный ЕГЭ/ });
  await expect(row).toContainText("1 400 ₽");

  // Повышение цены с будущей даты
  const from = addDays(localDateOf(new Date()), 30);
  await row.getByRole("button", { name: "Изменить тариф Семейный ЕГЭ" }).click();
  const edit = page.getByRole("dialog", { name: "Тариф" });
  await edit.getByLabel("Новая цена, ₽").fill("1450");
  await edit.getByLabel("С даты").fill(from);
  await edit.getByRole("button", { name: "Задать" }).click();
  await expect(page.getByText(`Цена 1 450 ₽ с ${formatLocalDate(from)}`)).toBeVisible();
  await expect(edit.getByText("запланирована")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toContainText(`1 450 ₽ с ${formatLocalDate(from)}`);

  // Назначить ученику
  await page.goto("/clients");
  await page.getByRole("link", { name: "Смирнова Юлия" }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();
  const form = page.getByRole("dialog", { name: "Редактировать ученика" });
  await form.getByLabel("Тариф").click();
  await page.getByRole("option", { name: /Семейный ЕГЭ — 1 400 ₽\/ч/ }).click();
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Изменения сохранены")).toBeVisible();
  await expect(page.getByText(/тариф «Семейный ЕГЭ»/)).toBeVisible();

  // Тариф с учеником удалить нельзя
  await page.goto("/subscriptions/tariffs");
  await page.getByRole("row", { name: /Семейный ЕГЭ/ }).getByRole("button", { name: "Удалить тариф Семейный ЕГЭ" }).click();
  const confirm = page.getByRole("dialog", { name: /Удалить тариф/ });
  await expect(confirm.getByText(/назначен 1 ученику/)).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Удалить" })).toBeDisabled();
});

test("администратор видит тарифы, но не меняет их", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/subscriptions/tariffs");
  await expect(page.getByRole("row", { name: /Семейный ЕГЭ/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Тариф", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Изменить тариф/ })).toHaveCount(0);
});
