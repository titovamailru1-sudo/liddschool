"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" />
      </span>
      <h2 className="text-base font-semibold">Не удалось загрузить данные</h2>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        Попробуйте ещё раз. Если ошибка повторяется, сообщите администратору
        {error.digest ? ` код ${error.digest}` : ""}.
      </p>
      <Button className="mt-5" variant="outline" onClick={reset}>
        Повторить
      </Button>
    </div>
  );
}
