import ExcelJS from "exceljs";
import { localDateOf } from "@/domain/calendar";
import { formatLocalDate } from "@/domain/format";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { now } from "@/server/clock";
import { prisma } from "@/server/db";
import { fullReport } from "@/server/reports";
import { requirePermission } from "@/server/session";
import { periodFromParams } from "../../period";

/** Отчёт за период в Excel: сводка, по месяцам, педагоги, программы, посещаемость, клиенты. */
export async function GET(req: Request) {
  await requirePermission("finance.reports");
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { period, previous } = periodFromParams(sp, localDateOf(now()));
  const r = await fullReport(prisma, period, previous);

  const wb = new ExcelJS.Workbook();
  const money = "#,##0 ₽;[Red]-#,##0 ₽";
  const sheet = (name: string, columns: { header: string; key: string; width: number; money?: boolean }[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((row) => ws.addRow(row));
    columns.forEach((c) => {
      if (c.money) ws.getColumn(c.key).numFmt = money;
    });
    return ws;
  };

  const summary = sheet(
    "Сводка",
    [
      { header: "Показатель", key: "k", width: 36 },
      { header: `${formatLocalDate(period.from)} – ${formatLocalDate(period.to)}`, key: "cur", width: 22, money: true },
      { header: `${formatLocalDate(previous.from)} – ${formatLocalDate(previous.to)}`, key: "prev", width: 22, money: true },
    ],
    [
      { k: "Поступления", cur: r.current.receipts, prev: r.before.receipts },
      { k: "Стоимость проведённых уроков (выручка)", cur: r.current.revenue, prev: r.before.revenue },
      { k: "Зарплаты педагогов", cur: r.current.salaries, prev: r.before.salaries },
      { k: "Расходы", cur: r.current.expenses, prev: r.before.expenses },
      { k: "Прибыль", cur: r.current.profit, prev: r.before.profit },
      { k: "Сумма долгов на сегодня", cur: r.debt, prev: null },
    ],
  );
  summary.addRow({});
  summary.addRow({ k: "Активные клиенты", cur: r.clients.active });
  summary.addRow({ k: "Новые клиенты", cur: r.clients.newClients });
  summary.addRow({ k: "Ушедшие клиенты", cur: r.clients.left });
  summary.addRow({ k: "Отток, %", cur: r.clients.churn });
  for (let i = 8; i <= 11; i++) summary.getRow(i).getCell(2).numFmt = "0.#";
  if (!r.current.bonusIncluded) summary.addRow({ k: "Надбавка педагогов не учтена: период короче месяца" });

  sheet(
    "По месяцам",
    [
      { header: "Месяц", key: "m", width: 10 },
      { header: "Выручка", key: "revenue", width: 16, money: true },
      { header: "Поступления", key: "receipts", width: 16, money: true },
      { header: "Зарплаты", key: "salaries", width: 16, money: true },
      { header: "Расходы", key: "expenses", width: 16, money: true },
      { header: "Прибыль", key: "profit", width: 16, money: true },
    ],
    r.series.map((s) => ({ m: s.key, revenue: s.revenue, receipts: s.receipts, salaries: s.salaries, expenses: s.expenses, profit: s.profit })),
  );
  sheet(
    "Педагоги",
    [
      { header: "Педагог", key: "name", width: 26 },
      { header: "Уроков", key: "lessons", width: 10 },
      { header: "Часов", key: "hours", width: 10 },
      { header: "Выручка", key: "revenue", width: 16, money: true },
      { header: "Зарплата", key: "salary", width: 16, money: true },
      { header: "Маржа", key: "margin", width: 16, money: true },
    ],
    r.teachers.map((t) => ({ name: t.fullName, lessons: t.lessons, hours: t.hours, revenue: t.revenue, salary: t.salary, margin: t.margin })),
  );
  sheet(
    "Программы",
    [
      { header: "Программа", key: "program", width: 22 },
      { header: "Формат", key: "kind", width: 16 },
      { header: "Оплата", key: "mode", width: 14 },
      { header: "Посещений", key: "visits", width: 12 },
      { header: "Часов", key: "hours", width: 10 },
      { header: "Выручка", key: "revenue", width: 16, money: true },
    ],
    r.programs.map((p) => ({
      program: PROGRAM_LABEL[p.program],
      kind: p.kind === "GROUP" ? "Группа" : "Индивидуально",
      mode: PAYMENT_MODE_LABEL[p.paymentMode],
      visits: p.visits,
      hours: p.hours,
      revenue: p.revenue,
    })),
  );
  sheet(
    "Посещаемость",
    [
      { header: "Уроки", key: "k", width: 22 },
      { header: "Количество", key: "n", width: 12 },
      { header: "Доля, %", key: "s", width: 10 },
    ],
    [
      { k: "Проведены", n: r.attendance.counts.done, s: r.attendance.shares.done },
      { k: "Пропуск неуважительный", n: r.attendance.counts.unexcused, s: r.attendance.shares.unexcused },
      { k: "Пропуск уважительный", n: r.attendance.counts.excused, s: r.attendance.shares.excused },
      { k: "Отменены школой", n: r.attendance.counts.cancelled, s: r.attendance.shares.cancelled },
    ],
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="report-${period.from}-${period.to}.xlsx"`,
    },
  });
}
