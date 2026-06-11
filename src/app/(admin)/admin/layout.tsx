import type { ReactNode } from "react";
import { requireSession } from "@/lib/session";
import { visibleNav } from "@/modules/admin/nav";
import { Sidebar } from "@/modules/admin/components/sidebar";
import { UserMenu } from "@/modules/admin/components/user-menu";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  const nav = visibleNav(ctx.role).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex min-h-screen">
      <aside className="bg-card hidden w-60 shrink-0 border-r md:block">
        <div className="flex h-14 items-center border-b px-5 font-semibold">Pronto Satisfação</div>
        <Sidebar items={nav} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="bg-card flex h-14 items-center justify-between border-b px-4">
          <div className="text-muted-foreground text-sm md:hidden">Pronto Satisfação</div>
          <div className="ml-auto">
            <UserMenu name={ctx.name} email={ctx.email} role={ctx.role} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
