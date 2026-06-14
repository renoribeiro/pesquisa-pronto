import type { UserRole } from "@prisma/client";
import { can } from "@/lib/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // nome do ícone lucide
  /** Mostrado apenas se o papel satisfizer este predicado. */
  visible: (role: UserRole) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", visible: () => true },
  {
    href: "/admin/surveys",
    label: "Pesquisas",
    icon: "ClipboardList",
    visible: (r) => can(r, "survey:view") || can(r, "survey:create"),
  },
  {
    href: "/admin/responses",
    label: "Respostas",
    icon: "MessageSquare",
    visible: (r) => can(r, "survey:view"),
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: "BarChart3",
    visible: (r) => can(r, "survey:view"),
  },
  {
    href: "/admin/reports",
    label: "Relatórios",
    icon: "FileText",
    visible: (r) => can(r, "survey:export"),
  },
  {
    href: "/admin/themes",
    label: "Temas",
    icon: "Palette",
    visible: (r) => can(r, "survey:create"),
  },
  {
    href: "/admin/users",
    label: "Usuários",
    icon: "Users",
    visible: (r) => can(r, "users:manage"),
  },
  {
    href: "/admin/settings",
    label: "Configurações",
    icon: "Settings",
    visible: (r) => can(r, "system:configure"),
  },
  {
    href: "/admin/lgpd",
    label: "LGPD",
    icon: "ShieldAlert",
    visible: (r) => can(r, "system:configure"),
  },
  {
    href: "/admin/audit",
    label: "Auditoria",
    icon: "ScrollText",
    visible: (r) => can(r, "system:configure"),
  },
  {
    href: "/admin/alerts",
    label: "Alertas",
    icon: "Bell",
    visible: (r) => can(r, "survey:view"),
  },
  {
    href: "/admin/super",
    label: "Super Admin",
    icon: "ShieldCheck",
    visible: (r) => r === "SUPER_ADMIN",
  },
];

export function visibleNav(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.visible(role));
}
