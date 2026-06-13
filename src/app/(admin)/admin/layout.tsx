import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";
import { visibleNav } from "@/modules/admin/nav";
import { Sidebar } from "@/modules/admin/components/sidebar";
import { UserMenu } from "@/modules/admin/components/user-menu";
import { ProntoclinicaLogo } from "@/components/logo";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const nav = visibleNav(ctx.role).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex min-h-screen bg-background text-[#3A3333]">
      <aside className="bg-background hidden w-64 shrink-0 shadow-[4px_0_16px_rgba(168,160,160,0.3)] md:block z-10">
        <div className="flex h-16 items-center px-4 shadow-[0_2px_8px_rgba(168,160,160,0.2)] bg-background">
          <ProntoclinicaLogo className="scale-90" />
        </div>
        <div className="mt-4">
          <Sidebar items={nav} />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="bg-background flex h-16 items-center justify-between shadow-[0_4px_12px_rgba(168,160,160,0.2)] px-6 z-10">
          <div className="md:hidden flex items-center">
            <ProntoclinicaLogo className="scale-75 -ml-2" />
          </div>
          <div className="hidden md:block">
            <span className="font-extrabold text-sm uppercase tracking-wider text-[#901A1E]">Painel Corporativo</span>
          </div>
          <div className="ml-auto">
            <UserMenu name={ctx.name} email={ctx.email} role={ctx.role} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-8 bg-background">{children}</main>
      </div>
    </div>
  );
}
