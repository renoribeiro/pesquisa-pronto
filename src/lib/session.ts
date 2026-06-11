import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { forTenant } from "@/lib/tenant";
import { can, type Permission } from "@/lib/rbac";
import type { UserRole } from "@prisma/client";

export interface SessionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  sectorIds: string[];
  name?: string | null;
  email?: string | null;
}

/**
 * Obtém o contexto da sessão atual ou `null` se não autenticado.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
    sectorIds: session.user.sectorIds ?? [],
    name: session.user.name,
    email: session.user.email,
  };
}

/**
 * Exige sessão autenticada (redireciona para /login se ausente).
 * Use no topo de páginas/layouts do painel admin.
 */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Exige sessão + permissão. Lança se faltar permissão.
 * Retorna o contexto e um cliente Prisma já isolado por tenant.
 */
export async function requirePermission(permission: Permission) {
  const ctx = await requireSession();
  if (!can(ctx.role, permission)) {
    throw new Error(`Permissão negada: ${permission}`);
  }
  return { ctx, db: forTenant(ctx.tenantId) };
}

/** Atalho: contexto + cliente Prisma isolado por tenant. */
export async function requireTenantDb() {
  const ctx = await requireSession();
  return { ctx, db: forTenant(ctx.tenantId) };
}
