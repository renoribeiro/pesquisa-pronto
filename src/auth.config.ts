import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@prisma/client";

interface AppUserFields {
  id: string;
  tenantId: string;
  role: UserRole;
  sectorIds: string[];
}

/**
 * Configuração edge-safe do NextAuth (sem dependências Node como Prisma/bcrypt).
 * Usada pelo middleware para proteção de rotas. Os providers são adicionados
 * em `src/auth.ts` (runtime Node).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    // Protege todo o painel /admin. Rotas públicas (/p, /login, /api públicas) passam.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAdminArea = nextUrl.pathname.startsWith("/admin");
      if (isAdminArea) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as Partial<AppUserFields>;
        token.id = u.id;
        token.tenantId = u.tenantId;
        token.role = u.role;
        token.sectorIds = u.sectorIds;
      }
      return token;
    },
    session({ session, token }) {
      const t = token as Partial<AppUserFields>;
      if (session.user) {
        session.user.id = t.id ?? "";
        session.user.tenantId = t.tenantId ?? "";
        session.user.role = (t.role ?? "VIEWER") as UserRole;
        session.user.sectorIds = t.sectorIds ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
