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
  const initials =
    (name ?? email ?? "?")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <Button 
          variant="ghost" 
          className="h-10 gap-2 px-4 bg-background shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl transition-all duration-300 flex items-center cursor-pointer text-[#3A3333] font-semibold text-sm active:translate-y-[0.5px]" 
        />
      }>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-[#901A1E] text-white font-bold">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm sm:inline text-[#3A3333] font-semibold">{name ?? email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background shadow-neumorphic border-0 rounded-2xl p-2 mt-2">
        <DropdownMenuLabel className="px-3 py-2">
          <div className="font-bold text-[#3A3333]">{name}</div>
          <div className="text-[#6E6565] text-xs mt-0.5">{email}</div>
          <div className="text-[#901A1E] mt-1.5 text-xs font-bold uppercase tracking-wider">{ROLE_LABELS[role] ?? role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#a8a0a0]/20 my-1.5" />
        <DropdownMenuItem onClick={() => doSignOut()} className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[#6E6565] hover:bg-[#901A1E]/10 hover:text-[#901A1E] transition-all duration-200">
          <LogOut className="h-4 w-4 text-inherit" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
