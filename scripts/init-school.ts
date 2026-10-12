/**
 * Первый запуск на продакшене (вместо сида, который стирает базу):
 *   npm run init:school -- owner@school.ru "Имя Фамилия"
 * Создаёт тарифы школы, шаблон ставки и владельца; печатает одноразовую ссылку, по которой владелец задаёт пароль.
 * Повторный запуск безопасен: ничего не дублирует, выдаёт новую ссылку.
 */
import { PrismaClient } from "@prisma/client";
import { firstOfMonth, localDateOf, parseLocalDate } from "../src/domain/calendar";
import { initSchool } from "../src/server/setup";

const [email, ...name] = process.argv.slice(2);
if (!email) {
  console.error('Использование: npm run init:school -- owner@school.ru "Имя Фамилия"');
  process.exit(1);
}

const prisma = new PrismaClient();
const { year, month } = parseLocalDate(localDateOf(new Date()));
initSchool(prisma, { ownerEmail: email, ownerName: name.join(" "), from: firstOfMonth(year, month) })
  .then(({ created, link }) => {
    console.log(created.length ? `Создано:\n  ${created.join("\n  ")}` : "Всё уже было создано раньше.");
    console.log(`\nСсылка для владельца (действует 7 дней, одноразовая):\n${link}`);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
