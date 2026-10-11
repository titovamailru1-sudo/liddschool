/**
 * Сид-данные для разработки. Полностью очищает базу и заполняет заново.
 * Запуск: npm run db:seed (пароль пользователей — SEED_PASSWORD из .env).
 */
import { PrismaClient, type Gender, type PaymentMode, type Prisma, type Program } from "@prisma/client";
import bcrypt from "bcryptjs";
import { firstOfMonth, fromDbDate, localDateOf, nextMonth, parseLocalDate, toDbDate } from "../src/domain/calendar";
import { occurrencesInMonth, type SeriesInput } from "../src/domain/schedule";
import { cancelLesson, settle } from "../src/server/lessons/service";
import { buildInvoiceDraft, issueInvoice } from "../src/server/billing/invoices";
import { acceptPayment } from "../src/server/billing/payments";

const prisma = new PrismaClient();

const TARIFFS_FROM = "2026-09-01";
// Текущий месяц по поясу школы: серии начинаются с его 1-го числа, уроки генерируются на него и следующий.
const TODAY = parseLocalDate(localDateOf(new Date()));
const SERIES_FROM = firstOfMonth(TODAY.year, TODAY.month);

const TEACHERS = [
  { key: "petrova", fullName: "Петрова Анна", subjects: ["математика", "ОГЭ"], color: "#8A88EE", phone: "+7 914 700-10-01" },
  { key: "kim", fullName: "Ким Денис", subjects: ["информатика", "Python"], color: "#45B48C", phone: "+7 914 700-10-02" },
  { key: "solovyova", fullName: "Соловьёва Ирина", subjects: ["математика", "ЕГЭ"], color: "#EC9A62", phone: "+7 914 700-10-03" },
  { key: "orlov", fullName: "Орлов Максим", subjects: ["информатика", "ЕГЭ"], color: "#E486AF", phone: "+7 914 700-10-04" },
] as const;
type TeacherKey = (typeof TEACHERS)[number]["key"];

// Все занятия онлайн: у каждого педагога постоянная ссылка (демо-адреса).
const ONLINE_URL: Record<TeacherKey, string> = {
  petrova: "https://telemost.yandex.ru/j/lidd-petrova",
  kim: "https://telemost.yandex.ru/j/lidd-kim",
  solovyova: "https://telemost.yandex.ru/j/lidd-solovyova",
  orlov: "https://telemost.yandex.ru/j/lidd-orlov",
};

interface SlotSeed {
  weekday: number;
  time: string;
  min: number;
}

interface ClientSeed {
  fullName: string;
  gender: Gender;
  grade: number;
  program: Program;
  paymentMode: PaymentMode;
  subject: string;
  teacher: TeacherKey;
  slots: SlotSeed[];
  startsOn?: string;
  parent: { fullName: string; relation: string; phone: string };
  goal?: string;
  debt?: number;
}

const CLIENTS: ClientSeed[] = [
  // Три ученика повторяют контрольные примеры из CLAUDE.md — их счёт за ноябрь можно сверить вручную.
  {
    fullName: "Иванов Миша", gender: "MALE", grade: 11, program: "EXAM", paymentMode: "MONTHLY",
    subject: "математика", teacher: "solovyova", slots: [{ weekday: 7, time: "16:00", min: 60 }],
    parent: { fullName: "Иванова Ольга Петровна", relation: "мама", phone: "+7 914 555-01-01" },
    goal: "ЕГЭ профиль, 80+",
  },
  {
    fullName: "Белова Маша", gender: "FEMALE", grade: 9, program: "EXAM", paymentMode: "MONTHLY",
    subject: "математика", teacher: "petrova",
    slots: [{ weekday: 2, time: "16:00", min: 60 }, { weekday: 5, time: "16:00", min: 60 }],
    parent: { fullName: "Белов Сергей Иванович", relation: "папа", phone: "+7 914 555-01-02" },
    goal: "ОГЭ на 5",
  },
  {
    fullName: "Козлов Саша", gender: "MALE", grade: 7, program: "SCHOOL", paymentMode: "MONTHLY",
    subject: "математика", teacher: "petrova",
    slots: [{ weekday: 1, time: "15:00", min: 60 }, { weekday: 3, time: "15:00", min: 60 }],
    parent: { fullName: "Козлова Марина Андреевна", relation: "мама", phone: "+7 914 555-01-03" },
    goal: "Подтянуть алгебру", debt: 1700,
  },
  {
    fullName: "Соколова Алиса", gender: "FEMALE", grade: 10, program: "EXAM", paymentMode: "PER_LESSON",
    subject: "информатика", teacher: "orlov", slots: [{ weekday: 3, time: "18:00", min: 90 }],
    parent: { fullName: "Соколова Елена Викторовна", relation: "мама", phone: "+7 914 555-01-04" },
  },
  {
    fullName: "Морозов Артём", gender: "MALE", grade: 11, program: "EXAM", paymentMode: "MONTHLY",
    subject: "информатика", teacher: "orlov",
    slots: [{ weekday: 1, time: "17:00", min: 90 }, { weekday: 4, time: "17:00", min: 90 }],
    parent: { fullName: "Морозова Татьяна Олеговна", relation: "мама", phone: "+7 914 555-01-05" },
    goal: "ЕГЭ информатика, 90+",
  },
  {
    fullName: "Волкова Ксения", gender: "FEMALE", grade: 8, program: "SCHOOL", paymentMode: "PER_LESSON",
    subject: "математика", teacher: "petrova", slots: [{ weekday: 6, time: "12:00", min: 60 }],
    parent: { fullName: "Волков Андрей Павлович", relation: "папа", phone: "+7 914 555-01-06" },
  },
  {
    fullName: "Лебедев Никита", gender: "MALE", grade: 6, program: "SCHOOL", paymentMode: "MONTHLY",
    subject: "информатика", teacher: "kim", slots: [{ weekday: 2, time: "15:00", min: 45 }],
    parent: { fullName: "Лебедева Анна Сергеевна", relation: "мама", phone: "+7 914 555-01-07" },
  },
  {
    fullName: "Новикова Софья", gender: "FEMALE", grade: 11, program: "EXAM", paymentMode: "MONTHLY",
    subject: "математика", teacher: "solovyova",
    slots: [{ weekday: 2, time: "18:00", min: 60 }, { weekday: 4, time: "18:00", min: 60 }],
    parent: { fullName: "Новикова Ирина Дмитриевна", relation: "мама", phone: "+7 914 555-01-08" },
  },
  {
    fullName: "Фёдоров Егор", gender: "MALE", grade: 9, program: "EXAM", paymentMode: "PER_LESSON",
    subject: "информатика", teacher: "orlov", slots: [{ weekday: 5, time: "16:00", min: 60 }],
    parent: { fullName: "Фёдорова Светлана Юрьевна", relation: "мама", phone: "+7 914 555-01-09" },
  },
  {
    fullName: "Кузнецова Варвара", gender: "FEMALE", grade: 7, program: "SCHOOL", paymentMode: "MONTHLY",
    subject: "математика", teacher: "solovyova", slots: [{ weekday: 6, time: "13:00", min: 60 }],
    parent: { fullName: "Кузнецов Олег Николаевич", relation: "папа", phone: "+7 914 555-01-10" },
  },
  {
    fullName: "Павлов Тимофей", gender: "MALE", grade: 10, program: "SCHOOL", paymentMode: "PER_LESSON",
    subject: "информатика", teacher: "kim", slots: [{ weekday: 4, time: "16:00", min: 60 }],
    startsOn: firstOfMonth(TODAY.year, TODAY.month).replace(/01$/, "15"), // пришёл в середине месяца
    parent: { fullName: "Павлова Наталья Игоревна", relation: "мама", phone: "+7 914 555-01-11" },
  },
  {
    fullName: "Смирнова Юлия", gender: "FEMALE", grade: 9, program: "EXAM", paymentMode: "MONTHLY",
    subject: "математика", teacher: "petrova", slots: [], // занимается только в группе ОГЭ-9А
    parent: { fullName: "Смирнова Оксана Викторовна", relation: "мама", phone: "+7 914 555-01-12" },
  },
];

const GROUPS = [
  {
    name: "ОГЭ-9А", subject: "математика", program: "EXAM" as Program, teacher: "petrova" as TeacherKey,
    maxStudents: 6, slot: { weekday: 6, time: "10:00", min: 90 },
    members: ["Белова Маша", "Смирнова Юлия", "Фёдоров Егор"],
  },
  {
    name: "Python-1", subject: "Python", program: "SCHOOL" as Program, teacher: "kim" as TeacherKey,
    maxStudents: 8, slot: { weekday: 3, time: "16:00", min: 90 },
    members: ["Лебедев Никита", "Павлов Тимофей", "Волкова Ксения", "Кузнецова Варвара"],
  },
];

async function wipe() {
  // Порядок важен из-за внешних ключей.
  await prisma.auditLog.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.message.deleteMany();
  await prisma.telegramInvite.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.invoiceAdjustment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.leadTouch.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.monthlyInvoice.deleteMany();
  await prisma.teacherAccrual.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.scheduleSeries.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.client.deleteMany();
  await prisma.payrollPayment.deleteMany();
  await prisma.payrollAdjustment.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.teacherRatePlan.deleteMany();
  await prisma.rateTier.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.user.deleteMany();
  await prisma.room.deleteMany();
  await prisma.tariff.deleteMany();
  await prisma.setting.deleteMany();
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Сид очищает базу — в продакшене запрещён");
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("Задайте SEED_PASSWORD в .env");

  await wipe();
  const passwordHash = await bcrypt.hash(password, 10);

  // ── Пользователи и педагоги ──
  const owner = await prisma.user.create({
    data: { email: "owner@lidd.school", name: "Владелец", role: "OWNER", passwordHash },
  });
  const admin = await prisma.user.create({
    data: { email: "admin@lidd.school", name: "Администратор", role: "ADMIN", passwordHash },
  });
  const kimUser = await prisma.user.create({
    data: { email: "kim@lidd.school", name: "Ким Денис", role: "TEACHER", passwordHash },
  });

  const teacherId = {} as Record<TeacherKey, string>;
  for (const t of TEACHERS) {
    const created = await prisma.teacher.create({
      data: {
        fullName: t.fullName,
        phone: t.phone,
        color: t.color,
        onlineUrl: ONLINE_URL[t.key],
        subjects: [...t.subjects],
        userId: t.key === "kim" ? kimUser.id : undefined,
      },
    });
    teacherId[t.key] = created.id;
  }

  // ── Тарифы (₽ за урок-час) ──
  const tariffs: Omit<Prisma.TariffCreateManyInput, "validFrom">[] = [
      { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 1500 },
      { kind: "INDIVIDUAL", program: "EXAM", paymentMode: "PER_LESSON", pricePerHour: 1700 },
      { kind: "INDIVIDUAL", program: "SCHOOL", paymentMode: "MONTHLY", pricePerHour: 1300 },
      { kind: "INDIVIDUAL", program: "SCHOOL", paymentMode: "PER_LESSON", pricePerHour: 1500 },
      // Группы: 800–1000 ₽ — значения нужно подтвердить у владельца.
      { kind: "GROUP", program: "EXAM", paymentMode: "MONTHLY", pricePerHour: 800 },
      { kind: "GROUP", program: "EXAM", paymentMode: "PER_LESSON", pricePerHour: 1000 },
      { kind: "GROUP", program: "SCHOOL", paymentMode: "MONTHLY", pricePerHour: 800 },
      { kind: "GROUP", program: "SCHOOL", paymentMode: "PER_LESSON", pricePerHour: 1000 },
  ];
  await prisma.tariff.createMany({
    data: tariffs.map((t) => ({ ...t, validFrom: toDbDate(TARIFFS_FROM) })),
  });

  // ── Шаблон ставки школы ──
  const plan = await prisma.ratePlan.create({
    data: {
      name: "Стандартный шаблон школы",
      isDefault: true,
      type: "PER_HOUR",
      baseAmount: 700,
      groupPerStudent: 100,
      trialFixed: 500,
      payForUnexcused: false,
      bonusApply: "WHOLE_MONTH",
      tiers: {
        create: [
          { thresholdHours: 30, bonusPercent: 10 },
          { thresholdHours: 45, bonusPercent: 15 },
        ],
      },
    },
  });
  await prisma.teacherRatePlan.createMany({
    data: TEACHERS.map((t) => ({ teacherId: teacherId[t.key], planId: plan.id, validFrom: toDbDate(TARIFFS_FROM) })),
  });

  // ── Клиенты, родители, индивидуальные серии ──
  const clientId: Record<string, string> = {};
  for (const c of CLIENTS) {
    const client = await prisma.client.create({
      data: {
        fullName: c.fullName,
        gender: c.gender,
        grade: c.grade,
        program: c.program,
        paymentMode: c.paymentMode,
        goal: c.goal,
        source: "REFERRAL",
        parents: { create: { ...c.parent, isPrimary: true } },
      },
    });
    clientId[c.fullName] = client.id;

    for (const slot of c.slots) {
      await prisma.scheduleSeries.create({
        data: {
          teacherId: teacherId[c.teacher],
          clientId: client.id,
          subject: c.subject,
          program: c.program,
          weekday: slot.weekday,
          startTime: slot.time,
          durationMin: slot.min,
          format: "ONLINE",
          onlineUrl: ONLINE_URL[c.teacher],
          createdById: admin.id,
          startsOn: toDbDate(c.startsOn ?? SERIES_FROM),
        },
      });
    }

    if (c.debt) {
      await prisma.ledgerEntry.create({
        data: {
          clientId: client.id,
          type: "ADJUSTMENT",
          amount: -c.debt,
          comment: "Долг за сентябрь, перенесён из таблицы",
          createdById: admin.id,
        },
      });
    }
  }

  // ── Группы и групповые серии ──
  for (const g of GROUPS) {
    const group = await prisma.group.create({
      data: {
        name: g.name,
        subject: g.subject,
        program: g.program,
        teacherId: teacherId[g.teacher],
        maxStudents: g.maxStudents,
        members: { create: g.members.map((name) => ({ clientId: clientId[name], joinedAt: toDbDate(SERIES_FROM) })) },
      },
    });
    await prisma.scheduleSeries.create({
      data: {
        teacherId: teacherId[g.teacher],
        groupId: group.id,
        subject: g.subject,
        program: g.program,
        weekday: g.slot.weekday,
        startTime: g.slot.time,
        durationMin: g.slot.min,
        format: "ONLINE",
        onlineUrl: ONLINE_URL[g.teacher],
        createdById: admin.id,
        startsOn: toDbDate(SERIES_FROM),
      },
    });
  }

  // ── Уроки из серий на текущий и следующий месяц ──
  const allSeries = await prisma.scheduleSeries.findMany();
  const inputs: SeriesInput[] = allSeries.map((s) => ({
    id: s.id,
    weekday: s.weekday,
    startTime: s.startTime,
    durationMin: s.durationMin,
    startsOn: fromDbDate(s.startsOn),
    endsOn: s.endsOn ? fromDbDate(s.endsOn) : null,
  }));
  const byId = new Map(allSeries.map((s) => [s.id, s]));
  const months = [TODAY, nextMonth(TODAY.year, TODAY.month)];

  let lessonsCount = 0;
  for (const m of months) {
    const occ = occurrencesInMonth(inputs, m.year, m.month);
    await prisma.lesson.createMany({
      data: occ.map((o) => {
        const s = byId.get(o.seriesId)!;
        return {
          seriesId: s.id,
          teacherId: s.teacherId,
          clientId: s.clientId,
          groupId: s.groupId,
          subject: s.subject,
          program: s.program,
          startsAt: o.startsAt,
          durationMin: o.durationMin,
          format: s.format,
          onlineUrl: s.onlineUrl,
          createdById: s.createdById,
        };
      }),
    });
    lessonsCount += occ.length;
  }

  // ── Прошедшие уроки: отмечаем через тот же сервис, что и интерфейс ──
  // Последние двое суток оставляем неотмеченными — чтобы было что отметить при проверке.
  const markBefore = new Date(Date.now() - 2 * 24 * 3_600_000);
  const past = await prisma.lesson.findMany({
    where: { startsAt: { lt: markBefore } },
    orderBy: { startsAt: "asc" },
    select: { id: true, clientId: true, groupId: true },
  });
  const actor = { userId: admin.id };
  for (const [i, l] of past.entries()) {
    if (l.clientId) {
      if (i % 17 === 5) await cancelLesson(prisma, actor, l.id, { by: "SCHOOL", reason: "Педагог на больничном" });
      else if (i % 19 === 7) await cancelLesson(prisma, actor, l.id, { by: "CLIENT", excused: true, reason: "Предупредили заранее" });
      else if (i % 23 === 11) await settle(prisma, actor, l.id, { kind: "DONE", attendance: { [l.clientId]: "ABSENT_UNEXCUSED" } });
      else await settle(prisma, actor, l.id, { kind: "DONE", attendance: { [l.clientId]: "PRESENT" } });
    } else if (l.groupId) {
      const members = await prisma.groupMember.findMany({ where: { groupId: l.groupId }, select: { clientId: true } });
      const attendance = Object.fromEntries(
        members.map((m, j) => [m.clientId, (i + j) % 7 === 0 ? ("ABSENT_EXCUSED" as const) : ("PRESENT" as const)]),
      );
      await settle(prisma, actor, l.id, { kind: "DONE", attendance });
    }
  }

  // ── Настройки ──
  const settings: Record<string, unknown> = {
    invoiceDay: 25,
    invoiceDueDay: 1,
    overdueDay: 3,
    perLessonLinkHours: 48,
    perLessonDeadlineHours: 24,
    creditOnSchoolCancel: true,
    creditOnExcused: true,
    recalcOnScheduleChange: true,
    // Демо-реквизиты для страницы оплаты — владелец заменяет их в «Настройках».
    payee: {
      name: "ДЕМО: ИП Лидд (замените в Настройках)",
      payeeInn: "250000000000",
      bankName: "ДЕМО-БАНК",
      bic: "040500000",
      personalAcc: "40802810000000000000",
      correspAcc: "30101810000000000000",
      sbpPhone: "+7 914 700-00-00",
    },
  };
  await prisma.setting.createMany({
    data: Object.entries(settings).map(([key, value]) => ({ key, value: value as never })),
  });

  // ── Оплата текущего месяца ──
  // Абонементщикам — счёт на оставшиеся уроки месяца, выставлен и списан. Почти все оплатили:
  // у Козлова Саши остаётся долг, Новикова Софья заплатила половину.
  const monthly = await prisma.client.findMany({ where: { paymentMode: "MONTHLY" }, select: { id: true, fullName: true } });
  for (const c of monthly) {
    const draft = await buildInvoiceDraft(prisma, c.id, TODAY.year, TODAY.month);
    if (!draft.ok) continue;
    await issueInvoice(prisma, draft.invoiceId, admin.id, localDateOf(new Date()));
    if (c.fullName === "Козлов Саша") continue;
    const amount = c.fullName === "Новикова Софья" ? Math.round(draft.total / 2) : draft.total;
    if (amount > 0) {
      await acceptPayment(prisma, admin.id, { clientId: c.id, amount, method: "SBP", invoiceId: draft.invoiceId });
    }
  }
  // Поурочники: Алиса внесла предоплату, Егор частично погасил долг.
  await acceptPayment(prisma, admin.id, { clientId: clientId["Соколова Алиса"], amount: 6000, method: "TRANSFER", comment: "Предоплата за несколько уроков" });
  await acceptPayment(prisma, admin.id, { clientId: clientId["Фёдоров Егор"], amount: 3400, method: "CASH" });

  await prisma.auditLog.create({
    data: { entity: "System", entityId: "seed", action: "seed", userId: owner.id },
  });

  console.log(
    `Готово: 3 пользователя, ${TEACHERS.length} педагога, ${CLIENTS.length} учеников, ` +
      `${GROUPS.length} группы, ${allSeries.length} серий, ${lessonsCount} уроков (${SERIES_FROM} и следующий месяц).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
