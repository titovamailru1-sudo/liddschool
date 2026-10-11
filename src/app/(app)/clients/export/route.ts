import ExcelJS from "exceljs";
import { localDateOf } from "@/domain/calendar";
import { PAYMENT_MODE_LABEL, PROGRAM_LABEL } from "@/lib/status";
import { clientList } from "@/server/clients/queries";
import { now } from "@/server/clock";
import { requirePermission } from "@/server/session";
import { parseClientFilters } from "../filters";

const STATUS = { ACTIVE: "Активен", PAUSED: "Пауза", ARCHIVED: "Архив" } as const;

/** Выгрузка таблицы клиентов в Excel с теми же фильтрами, что на экране. */
export async function GET(req: Request) {
  const user = await requirePermission("clients.view");
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await clientList(user, parseClientFilters(sp));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Клиенты");
  const money = rows.some((r) => r.balance !== null);
  ws.columns = [
    { header: "ФИО", key: "name", width: 28 },
    { header: "Класс", key: "grade", width: 8 },
    { header: "Программа", key: "program", width: 20 },
    { header: "Оплата", key: "mode", width: 14 },
    { header: "Статус", key: "status", width: 10 },
    { header: "Родитель", key: "parent", width: 30 },
    { header: "Телефон родителя", key: "phone", width: 20 },
    { header: "Предметы", key: "subjects", width: 24 },
    { header: "Педагоги", key: "teachers", width: 30 },
    { header: "Группы", key: "groups", width: 16 },
    ...(money ? [{ header: "Баланс, ₽", key: "balance", width: 12 }] : []),
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      name: r.fullName,
      grade: r.grade,
      program: PROGRAM_LABEL[r.program],
      mode: PAYMENT_MODE_LABEL[r.paymentMode],
      status: STATUS[r.status],
      parent: r.parent?.fullName ?? "",
      phone: r.parent?.phone ?? "",
      subjects: r.subjects.join(", "),
      teachers: r.teachers.map((t) => t.fullName).join(", "),
      groups: r.groups.join(", "),
      balance: r.balance,
    });
  }
  if (money) ws.getColumn("balance").numFmt = "#,##0 ₽;[Red]-#,##0 ₽";

  const buf = await wb.xlsx.writeBuffer();
  const name = `clients-${localDateOf(now())}.xlsx`;
  return new Response(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}
