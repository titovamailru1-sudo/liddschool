"use client";

import { reachGoal } from "./metrika";

/** Ссылка на телефон или мессенджер: клик считается целью в Метрике. */
export function ContactLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={className}
      onClick={() => reachGoal("contact_click")}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
