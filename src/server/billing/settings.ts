import type { PayeeDetails } from "@/domain/billing";
import type { Db } from "../lessons/context";

export interface SchoolSettings {
  invoiceDay: number; // 25 — формирование счетов на следующий месяц
  invoiceDueDay: number; // 1 — срок оплаты и списание абонемента
  overdueDay: number; // 3 — просрочка: задача администратору и напоминание
  perLessonLinkHours: number; // 48 — ссылка на оплату урока
  perLessonDeadlineHours: number; // 24 — дедлайн оплаты урока
  creditOnSchoolCancel: boolean;
  creditOnExcused: boolean;
  payee: Partial<PayeeDetails> & { sbpPhone?: string };
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  invoiceDay: 25,
  invoiceDueDay: 1,
  overdueDay: 3,
  perLessonLinkHours: 48,
  perLessonDeadlineHours: 24,
  creditOnSchoolCancel: true,
  creditOnExcused: true,
  payee: {},
};

export async function loadSettings(db: Db): Promise<SchoolSettings> {
  const rows = await db.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as SchoolSettings;
}

export async function saveSetting(db: Db, key: keyof SchoolSettings, value: unknown) {
  const json = JSON.parse(JSON.stringify(value));
  await db.setting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
}

/** Публичный адрес CRM — для ссылок на оплату в сообщениях. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
