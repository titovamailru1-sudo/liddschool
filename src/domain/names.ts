import petrovich from "petrovich";
import type { Gender } from "./constants";

/**
 * Склонение одного слова через petrovich с двумя исправлениями:
 * - библиотека не знает «ё» (Соловьёва → «Соловьёвы»), поэтому склоняем вариант с «е»
 *   и возвращаем «ё» на прежние места;
 * - правило «жи-ши» для окончаний (Миша → «Мишы», должно быть «Миши»).
 */
function inflect(word: string, fn: (w: string) => string): string {
  const plain = word.replace(/ё/g, "е").replace(/Ё/g, "Е");
  let out = fn(plain);
  if (plain !== word) {
    const chars = [...out];
    [...word].forEach((ch, i) => {
      if ((ch === "ё" || ch === "Ё") && i < chars.length) chars[i] = ch;
    });
    out = chars.join("");
  }
  return out.replace(/([гкхжчшщ])ы$/i, "$1и");
}

/**
 * Имя ученика в родительном падеже для сообщений: «Иванов Миша» → «Миши Иванова».
 * fullName хранится как «Фамилия Имя». Без пола используем общие правила (фамилию тогда не меняем).
 * Если в карточке задано ручное значение — используем его.
 */
export function studentNameGenitive(
  fullName: string,
  gender: Gender | null,
  override?: string | null,
): string {
  if (override && override.trim()) return override.trim();
  const parts = fullName.trim().split(/\s+/);
  const rules =
    gender === "MALE" ? petrovich.male : gender === "FEMALE" ? petrovich.female : petrovich.androgynous;
  if (parts.length === 1) return inflect(parts[0], rules.first.genitive);
  const [last, first] = parts;
  const lastGen = gender ? inflect(last, rules.last.genitive) : last;
  return `${inflect(first, rules.first.genitive)} ${lastGen}`;
}

/**
 * Обращение к родителю: «Иванова Ольга Петровна» → «Ольга Петровна»,
 * «Иванова Ольга» → «Ольга», «Ольга» → «Ольга».
 */
export function greetingName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 2) return parts[1];
  return parts[0];
}

const SUBJECT_DATIVE: Record<string, string> = {
  математика: "математике",
  алгебра: "алгебре",
  геометрия: "геометрии",
  информатика: "информатике",
  физика: "физике",
  программирование: "программированию",
  python: "Python",
};

/** Предмет в дательном падеже: «по математике», «по информатике». */
export function subjectDative(subject: string): string {
  const key = subject.trim().toLowerCase();
  if (SUBJECT_DATIVE[key]) return SUBJECT_DATIVE[key];
  if (key.endsWith("ия")) return subject.trim().slice(0, -1) + "и";
  if (key.endsWith("а")) return subject.trim().slice(0, -1) + "е";
  return subject.trim();
}

/** Список предметов: «по математике», «по математике и информатике». */
export function subjectsDative(subjects: readonly string[]): string {
  const uniq = [...new Set(subjects.map(subjectDative))];
  if (uniq.length <= 1) return uniq[0] ?? "";
  return `${uniq.slice(0, -1).join(", ")} и ${uniq[uniq.length - 1]}`;
}
