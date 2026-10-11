import type { StatusTone } from "@/components/status-badge";
import type { LessonDisplayStatus } from "@/domain/lessonSettlement";

export type { LessonDisplayStatus };

export const LESSON_STATUS: Record<LessonDisplayStatus, { label: string; tone: StatusTone }> = {
  planned: { label: "Запланирован", tone: "planned" },
  done: { label: "Проведён", tone: "done" },
  cancelled: { label: "Отменён", tone: "cancelled" },
  excused: { label: "Пропуск ув.", tone: "warning" },
  unexcused: { label: "Пропуск неув.", tone: "danger" },
  moved: { label: "Перенесён", tone: "moved" },
};

export const PAYMENT_STATUS = {
  paid: { label: "Оплачено", tone: "done" },
  pending: { label: "Ожидается", tone: "warning" },
  debt: { label: "Долг", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export const TASK_STATUS = {
  new: { label: "Новая", tone: "planned" },
  inProgress: { label: "В работе", tone: "moved" },
  overdue: { label: "Просрочена", tone: "danger" },
  done: { label: "Выполнена", tone: "done" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export const PAYMENT_MODE_LABEL = { MONTHLY: "Абонемент", PER_LESSON: "Поурочно" } as const;
export const PROGRAM_LABEL = { EXAM: "ОГЭ / ЕГЭ", SCHOOL: "Школьная программа" } as const;
