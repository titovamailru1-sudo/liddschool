"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Состояние календаря живёт в адресе страницы: вид, дата, фильтры, открытый урок. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const href = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      return q ? `${pathname}?${q}` : pathname;
    },
    [params, pathname],
  );

  const set = useCallback(
    (patch: Record<string, string | null | undefined>, mode: "push" | "replace" = "push") => {
      router[mode](href(patch), { scroll: false });
    },
    [router, href],
  );

  return { params, href, set };
}
