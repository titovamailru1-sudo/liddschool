"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavKey } from "@/lib/access";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_ICONS } from "./nav-icons";

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
}

export const SIDEBAR_COOKIE = "sidebar_collapsed";

export function NavLinks({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: readonly NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const link = (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-text-secondary transition-colors",
              "hover:bg-subtle hover:text-text-primary",
              active && "bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/** Левое меню 240 px, сворачивается до иконок. Состояние хранится в cookie, чтобы сервер рендерил сразу нужную ширину. */
export function Sidebar({ items, initialCollapsed }: { items: readonly NavItem[]; initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks items={items} collapsed={collapsed} />
      </div>
      <div className={cn("border-t p-3", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          className="text-text-secondary"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && "Свернуть"}
        </Button>
      </div>
    </aside>
  );
}
