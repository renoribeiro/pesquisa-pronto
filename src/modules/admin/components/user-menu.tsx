"use client";

import { LogOut } from "lucide-react";
import { doSignOut } from "@/modules/admin/sign-out-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CLINIC_ADMIN: "Admin da Clínica",
  SECTOR_MANAGER: "Gestor de Setor",
  OPERATOR: "Operador",
  VIEWER: "Visualizador",
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name?: string | null;
  email?: string | null;
  role: string;
}) {
  const initials = (name ?? email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-2" />}>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm sm:inline">{name ?? email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{name}</div>
          <div className="text-muted-foreground text-xs">{email}</div>
          <div className="text-muted-foreground mt-1 text-xs">{ROLE_LABELS[role] ?? role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => doSignOut()} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
