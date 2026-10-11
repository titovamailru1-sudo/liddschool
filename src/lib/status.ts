import type { StatusTone } from "@/components/status-badge";

/** Статус урока для отображения: учитывает посещаемость индивидуального урока. */
export type LessonDisplayStatus = "planned" | "done" | "cancelled" | "excused" | "unexcused" | "moved";

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

/** Статус урока из БД → вариант отображения (посещаемость учитывается на этапе 2). */
export function lessonDisplayStatus(status: "PLANNED" | "DONE" | "CANCELLED" | "MOVED"): LessonDisplayStatus {
  return ({ PLANNED: "planned", DONE: "done", CANCELLED: "cancelled", MOVED: "moved" } as const)[status];
}
