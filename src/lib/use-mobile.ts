"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)"; // уже брейкпоинта md

function subscribe(cb: () => void) {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/**
 * Узкий экран (телефон). На сервере ширины нет — берём подсказку по User-Agent,
 * чтобы телефон сразу получил мобильную разметку без мигания.
 */
export function useIsMobile(serverHint = false) {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => serverHint,
  );
}
