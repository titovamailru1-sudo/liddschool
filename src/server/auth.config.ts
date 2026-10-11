import type { NextAuthConfig } from "next-auth";
import { canAccessPath, type Role } from "@/lib/access";

/**
 * Часть настроек Auth.js без БД и bcrypt — её же использует proxy.ts.
 * Провайдер входа добавляется в server/auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teacherId = user.teacherId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role as Role;
      session.user.teacherId = (token.teacherId as string | null) ?? null;
      return session;
    },
    // Первый уровень защиты: без сессии — на /login, раздел не по роли — на /forbidden.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;
      // Страница оплаты по ссылке из сообщения — публичная (доступ по неугадываемому токену).
      if (pathname.startsWith("/pay/")) return true;
      if (pathname === "/login") {
        return user ? Response.redirect(new URL("/lessons", request.nextUrl)) : true;
      }
      if (!user) return false;
      if (!canAccessPath(user.role, pathname)) {
        return Response.redirect(new URL("/forbidden", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
