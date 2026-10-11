"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2Icon, Search, User, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Hit {
  kind: "client" | "lead" | "teacher";
  id: string;
  title: string;
  hint: string;
  href: string;
}

const ICON = { client: User, lead: UserPlus, teacher: GraduationCap } as const;

/** Поиск по клиентам, лидам и педагогам: результаты под полем, стрелки и Enter — переход. */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        if (res.ok) {
          setHits(await res.json());
          setActive(0);
          setOpen(true);
        }
      } catch {
        // запрос отменён следующим вводом
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };
  const shown = q.trim().length >= 2 ? hits : [];

  return (
    <div ref={box} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => shown.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(shown.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(shown[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Поиск по клиентам и лидам"
        className="h-9 bg-subtle pl-9"
        aria-label="Поиск"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
      />
      {loading && <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-text-secondary" />}
      {open && q.trim().length >= 2 && (
        <ul id="global-search-results" role="listbox" className="absolute top-11 right-0 left-0 z-40 max-h-96 overflow-y-auto rounded-lg border bg-surface p-1 shadow-lg">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-secondary">Ничего не найдено</li>
          ) : (
            shown.map((h, i) => {
              const Icon = ICON[h.kind];
              return (
                <li
                  key={h.kind + h.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(h);
                  }}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm", i === active && "bg-subtle")}
                >
                  <Icon className="size-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.title}</span>
                    {h.hint && <span className="block truncate text-xs text-text-secondary">{h.hint}</span>}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
