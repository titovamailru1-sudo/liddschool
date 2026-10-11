/**
 * Матрица прав по ролям. Чистый модуль без серверных зависимостей:
 * используется и в proxy.ts, и в серверных компонентах/действиях, и для построения меню.
 */

export type Role = "OWNER" | "ADMIN" | "TEACHER";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  TEACHER: "Педагог",
};

const ALL: readonly Role[] = ["OWNER", "ADMIN", "TEACHER"];
const STAFF: readonly Role[] = ["OWNER", "ADMIN"];
const OWNER: readonly Role[] = ["OWNER"];

export const PERMISSIONS = {
  "lessons.view": ALL, // педагог — только свои уроки
  "lessons.create": STAFF,
  "lessons.manage": STAFF, // перенос, отмена, расписание учеников
  "lessons.mark": ALL, // педагог — только свои уроки
  "lessons.finance": OWNER, // блок «Финансы урока», выручка дня
  "tasks.view": ALL, // педагог — только свои задачи
  "tasks.create": ALL,
  "clients.view": ALL, // педагог — только своих учеников
  "clients.create": STAFF,
  "clients.edit": STAFF, // карточка, родители, архив, приглашение в Telegram
  "groups.view": ALL, // педагог — только свои группы
  "teachers.view": STAFF,
  "teachers.create": STAFF, // администратор тоже добавляет педагогов (без доступа к ставкам)
  "teachers.edit": STAFF,
  "teachers.rates": OWNER, // ставки, начисления, зарплаты
  "finance.view": ALL, // набор вкладок зависит от роли
  "finance.payments": STAFF, // платежи и долги, приём оплаты
  "finance.expenses": OWNER,
  "finance.payroll": OWNER,
  "finance.reports": OWNER,
  "finance.myEarnings": ["TEACHER"],
  "subscriptions.view": STAFF, // счета абонементов: формирование, проверка, отправка
  "leads.view": STAFF,
  "leads.create": STAFF,
  "settings.manage": OWNER,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export type NavKey =
  | "lessons"
  | "tasks"
  | "clients"
  | "groups"
  | "teachers"
  | "finance"
  | "subscriptions"
  | "leads";

/** Левое меню — строго в этом порядке (CLAUDE.md → «Навигация»). */
export const NAV: readonly { key: NavKey; href: string; label: string; permission: Permission }[] = [
  { key: "lessons", href: "/lessons", label: "Уроки", permission: "lessons.view" },
  { key: "tasks", href: "/tasks", label: "Задачи", permission: "tasks.view" },
  { key: "clients", href: "/clients", label: "Клиенты", permission: "clients.view" },
  { key: "groups", href: "/groups", label: "Группы", permission: "groups.view" },
  { key: "teachers", href: "/teachers", label: "Педагоги", permission: "teachers.view" },
  { key: "finance", href: "/finance", label: "Финансы", permission: "finance.view" },
  { key: "subscriptions", href: "/subscriptions", label: "Абонементы", permission: "subscriptions.view" },
  { key: "leads", href: "/leads", label: "Лиды", permission: "leads.view" },
];

export function navFor(role: Role) {
  return NAV.filter((item) => can(role, item.permission));
}

export type FinanceTab = "payments" | "debts" | "expenses" | "payroll" | "reports" | "my";

export const FINANCE_TABS: readonly { key: FinanceTab; label: string; permission: Permission }[] = [
  { key: "payments", label: "Платежи", permission: "finance.payments" },
  { key: "debts", label: "Долги", permission: "finance.payments" },
  { key: "expenses", label: "Расходы", permission: "finance.expenses" },
  { key: "payroll", label: "Зарплаты", permission: "finance.payroll" },
  { key: "reports", label: "Отчёты", permission: "finance.reports" },
  { key: "my", label: "Мой заработок", permission: "finance.myEarnings" },
];

export function financeTabsFor(role: Role) {
  return FINANCE_TABS.filter((t) => can(role, t.permission));
}

/** Разделы и требуемое право. Проверяется в proxy.ts до рендера страницы. */
const ROUTES: readonly [prefix: string, permission: Permission][] = [
  ...NAV.map((n) => [n.href, n.permission] as [string, Permission]),
  ["/settings", "settings.manage"],
];

/** Можно ли роли открыть путь. Пути вне списка разделов (например, /forbidden) открыты всем вошедшим. */
export function canAccessPath(role: Role, pathname: string): boolean {
  const match = ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
  return match ? can(role, match[1]) : true;
}
