/** Часовой пояс школы. Все моменты времени храним в UTC, отображаем и считаем календарь в этом поясе. */
export const SCHOOL_TZ = "Asia/Vladivostok";

/** Неразрывный пробел: разделитель тысяч и пробел перед «₽». */
export const NBSP = " ";

export type Program = "EXAM" | "SCHOOL";
export type PaymentMode = "MONTHLY" | "PER_LESSON";
export type TariffKind = "INDIVIDUAL" | "GROUP";
export type Gender = "MALE" | "FEMALE";
export type LessonStatus = "PLANNED" | "DONE" | "CANCELLED" | "MOVED";
export type CancelledByKind = "SCHOOL" | "CLIENT";
export type AttendanceStatus = "PRESENT" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED";
export type BonusApply = "WHOLE_MONTH" | "ABOVE_THRESHOLD";
