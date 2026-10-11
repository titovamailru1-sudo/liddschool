import { expect, type Page } from "@playwright/test";
import { addDays, isoWeekday, localDateOf } from "../src/domain/calendar";
import { E2E_PASSWORD } from "../playwright.config";

export async function login(page: Page, who: "owner" | "admin" | "kim") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${who}@lidd.school`);
  await page.getByLabel("Пароль").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/lessons/);
}

/** Ближайший будущий понедельник (у Кима по понедельникам в сид-данных уроков нет). */
export function nextMonday(): string {
  const today = localDateOf(new Date());
  return addDays(today, ((8 - isoWeekday(today)) % 7) || 7);
}

/** Баланс клиента из карточки: «−2 550 ₽» → -2550. */
export async function balanceOf(page: Page, clientName: string): Promise<number> {
  await page.goto("/clients");
  await page.getByRole("link", { name: clientName }).click();
  const text = await page.getByText("Баланс").locator("..").locator("div").nth(1).innerText();
  return Number(text.replace(/[^\d−-]/g, "").replace("−", "-"));
}

export async function pickInSearchable(page: Page, scope: ReturnType<Page["getByRole"]>, placeholder: string, option: string) {
  await scope.getByRole("combobox").filter({ hasText: placeholder }).click();
  await page.getByPlaceholder("Поиск…").fill(option);
  await page.getByRole("option", { name: new RegExp(option) }).first().click();
}
