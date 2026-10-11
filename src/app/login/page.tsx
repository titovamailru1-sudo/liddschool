import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; invited?: string }> }) {
  const { expired, invited } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">Вход в CRM</h1>
            <p className="text-sm text-text-secondary">Lidd School · математика и информатика</p>
          </div>
        </div>
        {expired && (
          <p role="status" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
            Сессия устарела — войдите снова.
          </p>
        )}
        {invited && (
          <p role="status" className="mb-4 rounded-md bg-done-soft px-3 py-2 text-sm text-done">
            Пароль сохранён — войдите с ним.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
