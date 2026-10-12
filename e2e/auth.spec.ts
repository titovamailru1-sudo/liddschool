import { expect, test, type Page } from "@playwright/test";

/** Отправить форму входа и дождаться ответа сервера (иначе следующий клик теряется, пока форма занята). */
async function attempt(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/login") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Войти" }).click(),
  ]);
}

test("после 5 неудачных попыток вход по этому email временно заблокирован", async ({ page }) => {
  await page.goto("/login");
  const email = `nobody-${Date.now()}@lidd.school`;
  for (let i = 0; i < 5; i++) {
    await attempt(page, email, `wrong-${i}`);
    await expect(page.getByText("Неверный email или пароль")).toBeVisible();
  }
  await attempt(page, email, "wrong-again");
  await expect(page.getByText(/Слишком много попыток входа/)).toBeVisible();
});
