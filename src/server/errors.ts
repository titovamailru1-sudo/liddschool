/** Ошибка бизнес-правила: текст показывается пользователю как есть. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
