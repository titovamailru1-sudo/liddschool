"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "./actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
        <p className="text-xs text-text-secondary">Не короче 8 символов.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="repeat">Повторите пароль</Label>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Сохранить и перейти ко входу
      </Button>
    </form>
  );
}
