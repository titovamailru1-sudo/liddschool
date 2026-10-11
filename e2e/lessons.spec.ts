import { expect, test } from "@playwright/test";
import { balanceOf, login, nextMonday, pickInSearchable } from "./helpers";

test.describe.configure({ mode: "serial" });

test("администратор: создать урок → конфликт педагога → отметить → списание с баланса", async ({ page }) => {
  await login(page, "admin");
  const before = await balanceOf(page, "Соколова Алиса");
  const monday = nextMonday();

  await page.goto(`/lessons?view=day&date=${monday}`);
  await page.getByRole("button", { name: "Урок", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Новый урок" });
  await pickInSearchable(page, sheet, "Выберите ученика", "Соколова Алиса");
  await sheet.getByLabel("Педагог").click();
  await page.getByRole("option", { name: "Ким Денис" }).click();
  await sheet.getByLabel("Предмет").fill("информатика");
  await sheet.getByLabel("Дата").fill(monday);
  await sheet.getByLabel("Время").fill("12:00");
  await expect(sheet.getByLabel("Ссылка на занятие")).toHaveValue(/lidd-kim/);
  await sheet.getByRole("button", { name: "Создать урок" }).click();

  // После создания открывается панель урока.
  const panel = page.getByRole("dialog", { name: "Соколова Алиса" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Запланирован")).toBeVisible();
  await page.keyboard.press("Escape");

  // Второй урок у того же педагога в то же время — запрет.
  await page.getByRole("button", { name: "Урок", exact: true }).click();
  const sheet2 = page.getByRole("dialog", { name: "Новый урок" });
  await pickInSearchable(page, sheet2, "Выберите ученика", "Фёдоров Егор");
  await sheet2.getByLabel("Педагог").click();
  await page.getByRole("option", { name: "Ким Денис" }).click();
  await sheet2.getByLabel("Дата").fill(monday);
  await sheet2.getByLabel("Время").fill("12:30");
  await expect(sheet2.getByText("Педагог в это время занят")).toBeVisible();
  await expect(sheet2.getByRole("button", { name: "Создать урок" })).toBeDisabled();
  await sheet2.getByRole("button", { name: "Отмена" }).click();

  // Отметить проведённым: поурочнику списывается 1 × 1 700.
  await page.getByRole("button", { name: /12:00.*Соколова Алиса/ }).click();
  await page.getByRole("dialog", { name: "Соколова Алиса" }).getByRole("button", { name: "Проведён" }).click();
  await expect(page.getByText("Урок отмечен")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Соколова Алиса" }).getByText("Проведён").first()).toBeVisible();

  expect(await balanceOf(page, "Соколова Алиса")).toBe(before - 1700);
});

test("администратор: снять отметку, отмена учеником как неуважительный пропуск", async ({ page }) => {
  await login(page, "admin");
  await page.goto(`/lessons?view=day&date=${nextMonday()}`);
  await page.getByRole("button", { name: /12:00.*Соколова Алиса/ }).click();
  const panel = page.getByRole("dialog", { name: "Соколова Алиса" });
  await panel.getByRole("button", { name: "Снять отметку" }).click();
  await expect(page.getByText("Отметка снята")).toBeVisible();

  await panel.getByRole("button", { name: "Отменить урок" }).click();
  const dlg = page.getByRole("dialog", { name: "Отменить урок" });
  await dlg.getByText("Отменил ученик").click();
  await dlg.getByText("Считать неуважительным").click();
  await dlg.getByRole("button", { name: "Отменить урок" }).click();
  await expect(page.getByText("Отмечен неуважительный пропуск")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Соколова Алиса" }).getByText("Пропуск неув.")).toBeVisible();
});

test("администратор: срок действия расписания ученика в карточке", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/clients");
  await page.getByRole("link", { name: "Иванов Миша" }).click();
  await page.getByRole("link", { name: "Расписание" }).click();
  await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "вс 16:00" });
  await expect(row.getByText("бессрочно")).toBeVisible();
  await row.getByRole("button", { name: "Срок" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Бессрочно").click();
  await dlg.getByLabel("Действует по (включительно)").fill("2026-12-31");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Срок расписания изменён")).toBeVisible();
  await expect(row.getByText("по 31.12.2026")).toBeVisible();
});

test("педагог: видит только свои уроки, отмечает группу; финансы урока — только владельцу", async ({ page, browser }) => {
  await login(page, "kim");
  await page.goto("/lessons?view=week");
  // Ученики других педагогов не видны: Миша (Соловьёва), Маша (Петрова), Алиса (Орлов).
  await expect(page.getByRole("button", { name: /Иванов Миша|Белова Маша|Соколова Алиса/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Лебедев Никита/ }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Педагог" })).toHaveCount(0); // фильтр по педагогу скрыт

  await page.goto("/lessons?view=list&status=planned");
  await page.getByRole("row", { name: /Python-1/ }).first().click();
  const panel = page.getByRole("dialog", { name: /Группа Python-1/ });
  await expect(panel.getByText("Посещаемость")).toBeVisible();
  await expect(panel.getByText("Финансы урока")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Перенести" })).toHaveCount(0);
  await panel.getByRole("radio", { name: "Неув." }).first().click();
  await panel.getByRole("button", { name: /Отметить урок · присутствуют 3 из 4/ }).click();
  await expect(page.getByText("Урок отмечен")).toBeVisible();
  const url = page.url();

  // Владелец видит «Финансы урока» у того же урока.
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await login(owner, "owner");
  await owner.goto(url.replace(/status=planned&?/, ""));
  const ownerPanel = owner.getByRole("dialog", { name: /Группа Python-1/ });
  await expect(ownerPanel.getByText("Финансы урока")).toBeVisible();
  await expect(ownerPanel.getByText(/1,5 ч × 700.*3 × 100/)).toBeVisible();
  await ownerCtx.close();
});
