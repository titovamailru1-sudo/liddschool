import { describe, expect, it } from "vitest";
import { alertText } from "./alerts";

describe("оповещения об ошибках", () => {
  it("источник, путь, текст ошибки и место в коде", () => {
    const e = new TypeError("Cannot read properties of undefined");
    e.stack = "TypeError: Cannot read properties of undefined\n    at x (/app/node_modules/next/a.js:1:1)\n    at load (/app/src/server/jobs.ts:42:7)";
    expect(alertText("web", e, "GET /lessons")).toBe(
      "⚠️ Lidd CRM — ошибка (web)\nGET /lessons\nTypeError: Cannot read properties of undefined\nat load (/app/src/server/jobs.ts:42:7)",
    );
  });

  it("не Error — тоже понятный текст, длинное сообщение обрезается", () => {
    expect(alertText("worker", "сломалось")).toBe("⚠️ Lidd CRM — ошибка (worker)\nError: сломалось");
    expect(alertText("worker", new Error("x".repeat(2000))).length).toBeLessThan(600);
  });
});
