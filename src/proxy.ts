import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

// Проверка входа и доступа к разделу по роли — см. callbacks.authorized в auth.config.ts.
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp)$).*)"],
};
