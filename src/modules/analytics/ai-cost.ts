import type { TenantClient } from "@/lib/tenant";

export interface AiCostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byJobType: { jobType: string; costUsd: number; calls: number }[];
  sinceDays: number;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Observabilidade de custo de IA — agrega os registros de AIUsageLog do tenant
 * nos últimos `sinceDays` dias, com totais e quebra por jobType.
 */
export async function getAiCostSummary(
  db: TenantClient,
  tenantId: string,
  sinceDays = 30,
): Promise<AiCostSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const where = { createdAt: { gte: since } };

  // Agregação no banco (o guard de tenant injeta tenantId em aggregate/groupBy):
  // evita carregar todas as linhas de AIUsageLog em memória.
  const [totals, grouped] = await Promise.all([
    db.aIUsageLog.aggregate({
      where,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    db.aIUsageLog.groupBy({
      by: ["jobType"],
      where,
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
  ]);

  const byJobType = grouped
    .map((g) => ({ jobType: g.jobType, costUsd: round4(g._sum.costUsd ?? 0), calls: g._count._all }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    totalCostUsd: round4(totals._sum.costUsd ?? 0),
    totalInputTokens: totals._sum.inputTokens ?? 0,
    totalOutputTokens: totals._sum.outputTokens ?? 0,
    byJobType,
    sinceDays,
  };
}
