import { redis } from "@/lib/redis";

/**
 * Rate limiter simples por janela fixa, backed por Redis.
 * Usado em rotas públicas e no login (proteção contra brute force).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Script Lua atômico: incrementa o contador e, somente na primeira requisição
 * da janela (quando o INCR retorna 1), define o EXPIRE. Isso evita que requisições
 * concorrentes resetem a janela perpetuamente (race entre INCR e EXPIRE no client).
 * Retorna [count, ttl] em uma única ida ao Redis.
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {count, ttl}
`;

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const [count, ttl] = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    redisKey,
    String(windowSeconds),
  )) as [number, number];
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetInSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

/** Limpa o contador (ex.: após login bem-sucedido). */
export async function resetRateLimit(key: string): Promise<void> {
  await redis.del(`ratelimit:${key}`);
}
