import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "./errors";

/** Результат серверного действия для форм: успех с сообщением для toast или понятная ошибка. */
export type Result<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** Ошибки бизнес-правил и валидации превращаются в текст для пользователя; остальные — пробрасываются. */
export async function runAction<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Проверьте поля формы" };
    throw e;
  }
}

/** Деньги и счета видны в нескольких разделах — обновляем их все. */
export function revalidateBilling() {
  for (const p of ["/clients", "/finance", "/subscriptions", "/lessons"]) revalidatePath(p, "layout");
}
