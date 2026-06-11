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

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const ttl = await redis.ttl(redisKey);
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
