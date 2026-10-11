import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Сессия есть, но пользователя больше нет или он отключён (например, база пересоздана сидом).
 * Удаляем cookie сессии Auth.js и ведём на вход — иначе /login и /lessons переадресуют друг на друга бесконечно.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (c.name.includes("authjs.session-token")) {
      jar.delete({ name: c.name, path: "/", secure: c.name.startsWith("__Secure-") });
    }
  }
  return NextResponse.redirect(new URL("/login?expired=1", req.url));
}
