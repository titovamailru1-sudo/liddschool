import { cookies } from "next/headers";
import { Sidebar, SIDEBAR_COOKIE } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { navFor } from "@/lib/access";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const nav = navFor(user.role).map(({ key, href, label }) => ({ key, href, label }));

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar items={nav} initialCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email, role: user.role }} nav={nav} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
