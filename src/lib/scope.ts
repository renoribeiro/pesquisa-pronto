import type { Scope } from "@/lib/rbac";

/**
 * Helpers PUROS de escopo de setor (sem dependências de auth/Next), para serem
 * testáveis isoladamente e reutilizados pela camada de sessão.
 *
 * Sentinela que não casa nenhum id real — usada quando um SECTOR_MANAGER não
 * tem setores atribuídos: nesse caso ele não deve ver nada (e não "tudo").
 */
export const NO_MATCH = "__no_sector__";

/** Apenas o necessário do contexto da sessão para o escopo de setor. */
interface SectorScopeCtx {
  sectorIds: string[];
}

/**
 * Filtro Prisma de escopo de setor para consultas sobre **Survey**.
 * - `scope === "all"`  → `{}` (sem restrição além do tenant).
 * - `scope === "sector"` → restringe às pesquisas dos setores do usuário
 *   (relação N-N `Survey.sectors`). Setores vazios = nada visível.
 */
export function surveySectorWhere(ctx: SectorScopeCtx, scope: Scope) {
  if (scope !== "sector") return {};
  const ids = ctx.sectorIds.length ? ctx.sectorIds : [NO_MATCH];
  return { sectors: { some: { id: { in: ids } } } };
}

/**
 * Filtro Prisma de escopo de setor para consultas sobre **Response**
 * (e modelos que se ligam a uma pesquisa, ex.: Answer/AIAnalysis via `survey`).
 * Filtra pela relação de setores da pesquisa associada.
 */
export function responseSectorWhere(ctx: SectorScopeCtx, scope: Scope) {
  if (scope !== "sector") return {};
  const ids = ctx.sectorIds.length ? ctx.sectorIds : [NO_MATCH];
  return { survey: { sectors: { some: { id: { in: ids } } } } };
}
