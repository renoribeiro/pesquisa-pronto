import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Cache leve sobre Redis para agregados caros (ex.: NPS do dashboard, que hoje
 * recalcula somando todas as respostas a cada visita).
 *
 * Princípios:
 *  - NUNCA derruba o fluxo: falha de Redis (leitura ou escrita) cai no cálculo
 *    direto via `fn`. Cache é otimização, não dependência.
 *  - Invalidação por VERSÃO (não por enumeração de chaves): `bumpCacheVersion`
 *    incrementa um contador por (namespace, tenant); como a versão entra na
 *    chave, todas as entradas antigas ficam inalcançáveis de imediato e expiram
 *    sozinhas pelo TTL. Evita varrer/`DEL` muitas chaves derivadas.
 */

/** Lê do cache; em miss/erro, computa via `fn`, grava com TTL e retorna. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn(`[cache] leitura falhou (${key}): ${err instanceof Error ? err.message : String(err)}`);
  }

  const value = await fn();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn(`[cache] escrita falhou (${key}): ${err instanceof Error ? err.message : String(err)}`);
  }
  return value;
}

function versionKey(namespace: string, tenantId: string): string {
  return `cachever:${namespace}:${tenantId}`;
}

/** Versão atual de invalidação de (namespace, tenant). "0" se ausente/erro. */
export async function cacheVersion(namespace: string, tenantId: string): Promise<string> {
  try {
    const v = await redis.get(versionKey(namespace, tenantId));
    return v ?? "0";
  } catch {
    return "0";
  }
}

/** Invalida todo o namespace de cache do tenant incrementando a versão. */
export async function bumpCacheVersion(namespace: string, tenantId: string): Promise<void> {
  try {
    await redis.incr(versionKey(namespace, tenantId));
  } catch (err) {
    logger.warn(
      `[cache] bump de versão falhou (${namespace}:${tenantId}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
