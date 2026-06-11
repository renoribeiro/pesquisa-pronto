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
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
