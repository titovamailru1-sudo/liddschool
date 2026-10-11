import { NextResponse } from "next/server";
import { globalSearch } from "@/server/search";
import { getCurrentUser } from "@/server/session";

/** Поиск в верхней панели: клиенты, лиды, педагоги — с учётом прав пользователя. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await globalSearch(user, q.slice(0, 80)));
}
