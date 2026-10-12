import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { authConfig } from "./auth.config";
import { loginByEmail, loginByIp } from "./rate-limit";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

// Сравниваем с фиктивным хэшем, если пользователя нет, — чтобы время ответа не выдавало, существует ли email.
const DUMMY_HASH = "$2b$10$DI7XlDxW3eyjXeAwk6OI7uByj5KNKTlRQOK5wg7jf9EMufWOaeaxa";

/** Слишком много неудачных попыток входа — форма показывает отдельное сообщение. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

function clientIp(request: Request | undefined) {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = `ip:${clientIp(request)}`;
        if (loginByEmail.retryAfter(email) || loginByIp.retryAfter(ip)) throw new TooManyAttempts();

        const user = await prisma.user.findUnique({
          where: { email },
          include: { teacher: { select: { id: true } } },
        });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !ok || !user.isActive) {
          loginByEmail.fail(email);
          loginByIp.fail(ip);
          return null;
        }
        loginByEmail.reset(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          teacherId: user.teacher?.id ?? null,
        };
      },
    }),
  ],
});
