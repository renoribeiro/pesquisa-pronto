import IORedis from "ioredis";
import { env } from "@/lib/env";

/**
 * Conexão Redis compartilhada.
 * Reutilizada em dev para evitar múltiplas conexões com hot-reload.
 *
 * BullMQ exige `maxRetriesPerRequest: null` na conexão usada por filas/workers.
 */
const globalForRedis = globalThis as unknown as { redis?: IORedis };

export const redis =
  globalForRedis.redis ??
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    // Não conecta no import; conecta no primeiro comando. Evita travar o build
    // e tentativas de conexão durante análise estática do Next.js.
    lazyConnect: true,
  });

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
