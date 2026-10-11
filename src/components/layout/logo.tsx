import { cn } from "@/lib/utils";

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
        L
      </span>
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Lidd School</span>}
    </div>
  );
}
