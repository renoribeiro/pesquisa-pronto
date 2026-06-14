import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { checkStorage } from "@/lib/storage";
import { getAllQueueMetrics, summarizeQueueHealth, type QueueMetric } from "@/server/queues/metrics";

/**
 * Health-check rico: Postgres, Redis, armazenamento (MinIO/S3) e profundidade
 * das filas. Cada verificação tem timeout próprio para nunca pendurar a rota.
 * GET /api/health
 */

type Check = "ok" | "error";

/** Resolve com timeout: se a verificação demorar demais, conta como erro. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout após ${ms}ms`)), ms),
    ),
  ]);
}

async function probe(fn: () => Promise<unknown>, ms = 2500): Promise<Check> {
  try {
    await withTimeout(fn(), ms);
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const checks: Record<string, Check> = {};

  // Verificações de conectividade em paralelo.
  const [database, redisCheck, storage] = await Promise.all([
    probe(() => prisma.$queryRaw`SELECT 1`),
    probe(() => redis.ping()),
    probe(() => checkStorage()),
  ]);
  checks.database = database;
  checks.redis = redisCheck;
  checks.storage = storage;

  // Profundidade das filas (best-effort): não derruba o health se indisponível,
  // mas sinaliza degradação por excesso de jobs falhos / backlog.
  let queues: QueueMetric[] | null = null;
  let queueHealthy = true;
  try {
    queues = await withTimeout(getAllQueueMetrics(), 2500);
    checks.queues = "ok";
    queueHealthy = summarizeQueueHealth(queues).healthy;
  } catch {
    checks.queues = "error";
  }

  const connectivityHealthy = Object.values(checks).every((v) => v === "ok");
  const healthy = connectivityHealthy && queueHealthy;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      queues: queues?.map((q) => ({ name: q.name, ...q.counts })) ?? null,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
