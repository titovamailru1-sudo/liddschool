"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  CalendarPlus,
  ClipboardPlus,
  LogOut,
  Menu,
  Plus,
  Settings,
  UserPlus,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { can, ROLE_LABEL, type Permission, type Role } from "@/lib/access";
import { logout } from "@/app/login/actions";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./sidebar";

const CREATE_ITEMS: { label: string; icon: LucideIcon; permission: Permission; stage: number; href?: string }[] = [
  { label: "Урок", icon: CalendarPlus, permission: "lessons.create", stage: 2, href: "/lessons?create=1" },
  { label: "Клиент", icon: UserRoundPlus, permission: "clients.create", stage: 3, href: "/clients?create=1" },
  { label: "Платёж", icon: Banknote, permission: "finance.payments", stage: 3, href: "/finance?tab=payments&pay=1" },
  { label: "Задача", icon: ClipboardPlus, permission: "tasks.create", stage: 5, href: "/tasks?create=1" },
  { label: "Лид", icon: UserPlus, permission: "leads.create", stage: 5, href: "/leads?create=1" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({ user, nav }: { user: { name: string; email: string; role: Role }; nav: readonly NavItem[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const createItems = CREATE_ITEMS.filter((i) => can(user.role, i.permission));

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur md:px-6">
      {/* Меню на телефоне */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-3">
          <SheetHeader className="px-1">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <NavLinks items={nav} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        {createItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9">
                <Plus />
                <span className="hidden sm:inline">Создать</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {createItems.map((item) =>
                item.href ? (
                  <DropdownMenuItem key={item.label} asChild>
                    <Link href={item.href}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={item.label}
                    onSelect={() => toast.info(`Создание: «${item.label}» — появится на этапе ${item.stage}`)}
                  >
                    <item.icon />
                    {item.label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Меню профиля">
              <Avatar className="size-7">
                <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand-text">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-text-secondary">{ROLE_LABEL[user.role]}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-text-secondary">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {can(user.role, "settings.manage") && (
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings />
                  Настройки
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <form action={logout} className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOut className="size-4" />
                  Выйти
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
