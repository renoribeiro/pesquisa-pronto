"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  BarChart3,
  FileText,
  Palette,
  Users,
  Settings,
  Bell,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/modules/admin/nav";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  BarChart3,
  FileText,
  Palette,
  Users,
  Settings,
  Bell,
  ShieldCheck,
};

export function Sidebar({ items }: { items: Pick<NavItem, "href" | "label" | "icon">[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2 p-4">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 border-l-4",
              active
                ? "bg-[#EBE6E6] shadow-neumorphic-inset text-[#901A1E] border-[#901A1E]"
                : "bg-transparent text-[#6E6565] hover:bg-[#E0DADA]/30 hover:text-[#3A3333] border-transparent"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-[#901A1E]" : "text-[#6E6565]")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
