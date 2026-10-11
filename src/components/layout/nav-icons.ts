import {
  Banknote,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Tag,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavKey } from "@/lib/access";

/** Иконки пунктов меню (ТЗ, раздел 4). */
export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  lessons: CalendarDays,
  tasks: ClipboardList,
  clients: User,
  groups: Users,
  teachers: GraduationCap,
  finance: Banknote,
  subscriptions: Tag,
  leads: UserPlus,
};
