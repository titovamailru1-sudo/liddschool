import type { Instrumentation } from "next";

/** Ошибки страниц, серверных действий и API — в лог и владельцу в Telegram (src/server/alerts.ts). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/alerts");
  // Путь без query-строки: в ней бывают id и токены.
  await reportError("web", error, `${request.method} ${request.path.split("?")[0]} (${context.routeType})`);
};
