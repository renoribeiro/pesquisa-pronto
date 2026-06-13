import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { forTenant } from "@/lib/tenant";
import { scopeOf, type Permission, type Scope } from "@/lib/rbac";
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
 * Retorna o contexto, um cliente Prisma já isolado por tenant e o `scope`
 * da permissão (`all` | `sector`) para o chamador aplicar o filtro de setor
 * quando aplicável (ver `surveySectorWhere` / `responseSectorWhere`).
 */
export async function requirePermission(permission: Permission) {
  const ctx = await requireSession();
  const scope = scopeOf(ctx.role, permission);
  if (scope === "none") {
    throw new Error(`Permissão negada: ${permission}`);
  }
  return { ctx, db: forTenant(ctx.tenantId), scope };
}

/** Atalho: contexto + cliente Prisma isolado por tenant. */
export async function requireTenantDb() {
  const ctx = await requireSession();
  return { ctx, db: forTenant(ctx.tenantId) };
}

// Sentinela que não casa nenhum id real — usada quando um SECTOR_MANAGER não
// tem setores atribuídos: nesse caso ele não deve ver nada (e não "tudo").
const NO_MATCH = "__no_sector__";

/**
 * Filtro Prisma de escopo de setor para consultas sobre **Survey**.
 * - `scope === "all"`  → `{}` (sem restrição além do tenant).
 * - `scope === "sector"` → restringe às pesquisas dos setores do usuário
 *   (relação N-N `Survey.sectors`). Setores vazios = nada visível.
 */
export function surveySectorWhere(ctx: SessionContext, scope: Scope) {
  if (scope !== "sector") return {};
  const ids = ctx.sectorIds.length ? ctx.sectorIds : [NO_MATCH];
  return { sectors: { some: { id: { in: ids } } } } as const;
}

/**
 * Filtro Prisma de escopo de setor para consultas sobre **Response**
 * (e modelos que se ligam a uma pesquisa, ex.: Answer/AIAnalysis via `survey`).
 * Filtra pela relação de setores da pesquisa associada.
 */
export function responseSectorWhere(ctx: SessionContext, scope: Scope) {
  if (scope !== "sector") return {};
  const ids = ctx.sectorIds.length ? ctx.sectorIds : [NO_MATCH];
  return { survey: { sectors: { some: { id: { in: ids } } } } } as const;
}
