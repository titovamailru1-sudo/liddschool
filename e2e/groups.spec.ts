import { expect, test } from "@playwright/test";
import { login, pickInSearchable } from "./helpers";

test.describe.configure({ mode: "serial" });

test("администратор: список групп, новая группа, ученик в составе, журнал посещаемости", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/groups");
  const oge = page.getByRole("row", { name: /ОГЭ-9А/ });
  await expect(oge).toContainText("Петрова Анна");
  await expect(oge).toContainText("3 / 6");
  await expect(oge).toContainText("сб 10:00");

  // Журнал посещаемости сид-группы: ученики × даты, отмеченные уроки.
  await oge.getByRole("link", { name: "ОГЭ-9А" }).click();
  await expect(page.getByRole("heading", { name: "Группа ОГЭ-9А" })).toBeVisible();
  // Сид-данные — с начала текущего месяца: по субботам, у каждого ученика клетка на каждый урок.
  const journal = page.getByRole("region", { name: "Журнал посещаемости" });
  const row = journal.getByRole("row", { name: /Белова Маша/ });
  await expect(row).toBeVisible();
  const lessons = await journal.getByRole("columnheader").getByRole("link").count();
  expect(lessons).toBeGreaterThanOrEqual(4);
  await expect(row.getByRole("cell")).toHaveCount(lessons + 2);

  // Новая группа → карточка → ученик.
  await page.goto("/groups");
  await page.getByRole("button", { name: "Группа", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Новая группа" });
  await sheet.getByLabel("Название").fill("ЕГЭ-11 профиль");
  await sheet.getByLabel("Максимум").fill("2");
  await sheet.getByLabel("Педагог").click();
  await page.getByRole("option", { name: "Соловьёва Ирина" }).click();
  await sheet.getByRole("button", { name: "Создать группу" }).click();
  await expect(page.getByRole("heading", { name: "Группа ЕГЭ-11 профиль" })).toBeVisible();

  const members = page.getByRole("region", { name: /Состав/ });
  await members.getByRole("button", { name: "Ученик" }).click();
  const add = page.getByRole("dialog", { name: "Добавить ученика в группу" });
  await pickInSearchable(page, add, "Выберите ученика", "Морозов Артём");
  await add.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText("Ученик добавлен в группу")).toBeVisible();
  await expect(members.getByRole("link", { name: "Морозов Артём" })).toBeVisible();
  await expect(members).toContainText("1 из 2");

  // Вывести из группы.
  await members.getByRole("button", { name: "Вывести из группы: Морозов Артём" }).click();
  await page.getByRole("dialog", { name: /Вывести из группы/ }).getByRole("button", { name: "Вывести" }).click();
  await expect(page.getByText("Ученик выведен из группы")).toBeVisible();
  await expect(members.getByText("В группе пока нет учеников.")).toBeVisible();
});

test("педагог видит только свои группы и без кнопок управления", async ({ page }) => {
  await login(page, "kim");
  await page.goto("/groups");
  await expect(page.getByRole("row", { name: /Python-1/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /ОГЭ-9А/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Группа", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Python-1" }).click();
  await expect(page.getByRole("heading", { name: "Группа Python-1" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Изменить группу|Ученик/ })).toHaveCount(0);
});
