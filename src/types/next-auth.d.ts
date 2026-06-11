import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Augmentação da sessão NextAuth: carrega tenantId, role e setores do usuário,
 * usados por toda a lógica multitenant + RBAC.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: UserRole;
      sectorIds: string[];
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    role: UserRole;
    sectorIds: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    role: UserRole;
    sectorIds: string[];
  }
}
