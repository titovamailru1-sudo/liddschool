"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { acceptInvite } from "@/server/payroll/teachers";

export async function acceptInviteAction(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (password !== repeat) return { error: "Пароли не совпадают" };
  try {
    await acceptInvite(prisma, token, password);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
  redirect("/login?invited=1");
}
