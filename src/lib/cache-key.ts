/**
 * Helpers PUROS de chave de cache (sem dependências de Redis/env), para serem
 * testáveis isoladamente e reutilizáveis na composição de chaves.
 */

export type SectorWhere = Record<string, unknown>;

/** Namespace de cache dos agregados de NPS (invalidado por novas respostas). */
export const NPS_CACHE_NS = "nps";

/**
 * Serialização estável (chaves ordenadas) para compor chaves de cache a partir
 * de objetos (ex.: filtro de setor), garantindo a mesma chave independente da
 * ordem de inserção das propriedades.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Monta a chave de cache do NPS. A versão entra na chave para invalidação O(1);
 * o filtro de setor é serializado de forma estável.
 */
export function npsCacheKey(
  version: string,
  tenantId: string,
  surveyId: string | undefined,
  sectorWhere: SectorWhere,
): string {
  return `${NPS_CACHE_NS}:${tenantId}:${version}:${surveyId ?? "all"}:${stableStringify(sectorWhere)}`;
}
