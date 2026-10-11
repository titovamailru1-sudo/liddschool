"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: "/lessons",
    });
    return {};
  } catch (e) {
    // Успешный вход завершается redirect — это тоже исключение, его пробрасываем дальше.
    if (e instanceof AuthError) return { error: "Неверный email или пароль", email };
    throw e;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
