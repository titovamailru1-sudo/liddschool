import { describe, expect, it } from "vitest";
import { canAccessPath, financeTabsFor, navFor } from "./access";

const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((n) => n.label);

describe("меню по ролям", () => {
  it("владелец видит все 8 пунктов в порядке из CLAUDE.md", () => {
    expect(labels("OWNER")).toEqual([
      "Уроки", "Задачи", "Клиенты", "Группы", "Педагоги", "Финансы", "Абонементы", "Лиды",
    ]);
  });

  it("администратор видит все 8 пунктов", () => {
    expect(labels("ADMIN")).toHaveLength(8);
  });

  it("педагог не видит Педагогов, Абонементы и Лиды", () => {
    expect(labels("TEACHER")).toEqual(["Уроки", "Задачи", "Клиенты", "Группы", "Финансы"]);
  });
});

describe("вкладки финансов", () => {
  const tabs = (role: Parameters<typeof financeTabsFor>[0]) => financeTabsFor(role).map((t) => t.key);

  it("владелец — всё, кроме «Мой заработок»", () => {
    expect(tabs("OWNER")).toEqual(["payments", "debts", "expenses", "payroll", "reports"]);
  });

  it("администратор — только платежи и долги (без расходов, зарплат, отчётов)", () => {
    expect(tabs("ADMIN")).toEqual(["payments", "debts"]);
  });

  it("педагог — только «Мой заработок»", () => {
    expect(tabs("TEACHER")).toEqual(["my"]);
  });
});

describe("доступ к путям", () => {
  it.each([
    ["TEACHER", "/leads", false],
    ["TEACHER", "/teachers/abc", false],
    ["TEACHER", "/subscriptions", false],
    ["TEACHER", "/lessons", true],
    ["TEACHER", "/finance", true],
    ["ADMIN", "/settings", false],
    ["ADMIN", "/teachers", true],
    ["OWNER", "/settings", true],
    ["TEACHER", "/forbidden", true],
    ["TEACHER", "/leadsX", true], // не префикс раздела
  ] as const)("%s → %s: %s", (role, path, ok) => expect(canAccessPath(role, path)).toBe(ok));
});
