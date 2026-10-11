import { describe, expect, it } from "vitest";
import { formatDate, formatHours, formatRub, formatTime, monthName, monthNamePrep, plural } from "./format";
import { greetingName, studentNameGenitive, subjectDative, subjectsDative } from "./names";

const NB = " ";

describe("formatRub", () => {
  it.each([
    [0, `0${NB}₽`],
    [700, `700${NB}₽`],
    [1500, `1${NB}500${NB}₽`],
    [1234567, `1${NB}234${NB}567${NB}₽`],
    [-1700, `−1${NB}700${NB}₽`],
  ])("%i → %s", (n, s) => expect(formatRub(n)).toBe(s));
});

describe("даты и время", () => {
  const at = new Date("2026-11-01T23:00:00Z"); // 02.11 09:00 во Владивостоке
  it("формат даты ДД.ММ.ГГГГ в поясе школы", () => expect(formatDate(at)).toBe("02.11.2026"));
  it("формат времени ЧЧ:ММ в поясе школы", () => expect(formatTime(at)).toBe("09:00"));
  it("часы с запятой", () => {
    expect(formatHours(1.5)).toBe("1,5");
    expect(formatHours(0.75)).toBe("0,75");
    expect(formatHours(36)).toBe("36");
  });
  it("месяцы", () => {
    expect(monthName(11)).toBe("ноябрь");
    expect(monthNamePrep(11)).toBe("ноябре");
    expect(monthNamePrep(5)).toBe("мае");
  });
});

describe("plural", () => {
  const f = ["занятие", "занятия", "занятий"] as const;
  it.each([
    [1, "занятие"],
    [2, "занятия"],
    [4, "занятия"],
    [5, "занятий"],
    [11, "занятий"],
    [12, "занятий"],
    [14, "занятий"],
    [21, "занятие"],
    [22, "занятия"],
    [111, "занятий"],
  ])("%i %s", (n, w) => expect(plural(n, f)).toBe(w));
});

describe("склонение имён", () => {
  it.each([
    ["Иванов Миша", "MALE", "Миши Иванова"],
    ["Козлов Саша", "MALE", "Саши Козлова"],
    ["Соловьёв Артём", "MALE", "Артёма Соловьёва"],
    ["Белова Маша", "FEMALE", "Маши Беловой"],
    ["Соловьёва Ксения", "FEMALE", "Ксении Соловьёвой"],
    ["Ким Алиса", "FEMALE", "Алисы Ким"],
    ["Ким Денис", "MALE", "Дениса Кима"],
    ["Шевченко Никита", "MALE", "Никиты Шевченко"],
  ] as const)("%s → %s", (name, gender, gen) => expect(studentNameGenitive(name, gender)).toBe(gen));

  it("ручное значение важнее автоматического", () => {
    expect(studentNameGenitive("Иванов Миша", "MALE", "Михаила Иванова")).toBe("Михаила Иванова");
  });

  it("без пола фамилию не склоняем", () => {
    expect(studentNameGenitive("Иванов Миша", null)).toBe("Миши Иванов");
  });

  it("обращение к родителю", () => {
    expect(greetingName("Иванова Ольга Петровна")).toBe("Ольга Петровна");
    expect(greetingName("Иванова Ольга")).toBe("Ольга");
  });

  it("предметы в дательном падеже", () => {
    expect(subjectDative("Математика")).toBe("математике"); // в середине фразы — со строчной
    expect(subjectDative("информатика")).toBe("информатике");
    expect(subjectDative("Python")).toBe("Python");
    expect(subjectsDative(["математика", "математика"])).toBe("математике");
  });
});
