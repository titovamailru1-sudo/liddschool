import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { prisma } from "@/server/db";
import { inviteInfo } from "@/server/payroll/teachers";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Приглашение", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = /^[\w-]{10,64}$/.test(token) ? await inviteInfo(prisma, token) : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <h1 className="text-lg font-semibold">{info ? `Здравствуйте, ${info.name}!` : "Ссылка недействительна"}</h1>
          <p className="text-sm text-text-secondary">
            {info ? (
              <>
                Придумайте пароль для входа в CRM. Логин — <b className="text-text-primary">{info.email}</b>
              </>
            ) : (
              "Ссылка устарела или уже использована. Попросите у администратора школы новую."
            )}
          </p>
        </div>
        {info && <InviteForm token={token} />}
      </div>
    </main>
  );
}
