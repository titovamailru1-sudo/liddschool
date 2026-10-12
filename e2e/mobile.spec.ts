import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/domain/calendar";
import { formatLocalDate } from "../src/domain/format";
import { login, nextMonday } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Через 2 недели: вторник с уроком Кима у Лебедева Никиты (15:00, 45 мин) и среда без него. */
const tuesday = () => addDays(nextMonday(), 15);

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("телефон педагога", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("«Уроки»: список дня, полоса дней, свайп, карточка урока", async ({ page }) => {
    await login(page, "kim");
    await page.goto(`/lessons?date=${tuesday()}`);
    await expect(page.getByRole("tablist", { name: "Дни недели" })).toBeVisible();
    const card = page.getByRole("button", { name: /Лебедев Никита/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("15:00");
    await expect(card).toContainText("Запланирован");
    await noHorizontalScroll(page);

    // Свайп влево — следующий день (среда), вправо — обратно.
    const list = page.locator(".touch-pan-y");
    const swipe = async (fromX: number, toX: number) => {
      await list.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: fromX, clientY: 400 }] });
      await list.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: toX, clientY: 410 }] });
    };
    await swipe(320, 80);
    await expect(page).toHaveURL(new RegExp(`date=${addDays(tuesday(), 1)}`));
    await expect(page.getByRole("button", { name: /Лебедев Никита/ })).toHaveCount(0);
    await swipe(80, 320);
    await expect(page).toHaveURL(new RegExp(`date=${tuesday()}`));

    // Полоса дней
    await page.getByRole("tab", { name: `Среда, ${formatLocalDate(addDays(tuesday(), 1)).slice(0, 5)}` }).click();
    await expect(page).toHaveURL(new RegExp(`date=${addDays(tuesday(), 1)}`));
    await page.goBack();

    // Карточка урока открывается на весь экран, отметка доступна.
    await page.getByRole("button", { name: /Лебедев Никита/ }).click();
    const sheet = page.getByRole("dialog", { name: "Лебедев Никита" });
    await expect(sheet.getByRole("button", { name: "Проведён" })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("«Мой заработок» помещается на экран", async ({ page }) => {
    await login(page, "kim");
    await page.goto("/finance?tab=my");
    await expect(page.getByText(/Начислено/).first()).toBeVisible();
    await expect(page.getByText("Проведённые уроки")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("меню открывается кнопкой", async ({ page }) => {
    await login(page, "kim");
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await page.getByRole("link", { name: "Финансы" }).click();
    await expect(page).toHaveURL(/\/finance/);
  });
});

test("администратор: перетащить урок в сетке недели → диалог переноса с новыми датой и временем", async ({ page }) => {
  await login(page, "admin");
  const wednesday = addDays(tuesday(), 1);
  await page.goto(`/lessons?view=week&date=${tuesday()}`);
  const block = page.getByRole("button", { name: /Лебедев Никита/ });
  // Сетка с 9:00, 56 px в часе: 18:00 → 9 × 56 = 504 px от верха колонки.
  await block.dragTo(page.locator(`[data-column="${wednesday}"]`), { sourcePosition: { x: 10, y: 5 }, targetPosition: { x: 20, y: 504 + 5 } });
  const dialog = page.getByRole("dialog", { name: "Перенести урок" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Лебедев Никита: было .* в 15:00/)).toBeVisible();
  await expect(dialog.getByLabel("Дата")).toHaveValue(wednesday);
  await expect(dialog.getByLabel("Время")).toHaveValue("18:00");
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toHaveCount(0);
});
