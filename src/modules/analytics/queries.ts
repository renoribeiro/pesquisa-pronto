import type { PrismaClient } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { cached, cacheVersion } from "@/lib/cache";
import { NPS_CACHE_NS, npsCacheKey } from "@/lib/cache-key";

export type DbClient = PrismaClient | TenantClient;

// Re-export para conveniência dos invalidadores (ex.: responses/actions).
export { NPS_CACHE_NS };
const NPS_CACHE_TTL_SECONDS = 300; // ~5 min (alinhado ao plano)

export interface NpsSummary {
  score: number;
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
}

export interface ResponsesByDay {
  date: string;
  count: number;
}

export interface ChannelBreakdown {
  channel: string;
  count: number;
}

export interface SectorBreakdown {
  sector: string;
  count: number;
}

/**
 * Filtro de escopo de setor (relação `survey.sectors`), produzido por
 * `responseSectorWhere(ctx, scope)` em `@/lib/session`. `{}` quando o papel
 * tem escopo `all`; um filtro por relação quando `sector`.
 */
export type SectorWhere = Record<string, unknown>;

export async function getNpsSummary(
  db: DbClient,
  tenantId: string,
  surveyId?: string,
  sectorWhere: SectorWhere = {},
): Promise<NpsSummary> {
  const where = {
    tenantId,
    completed: true,
    npsScore: { not: null },
    ...(surveyId ? { surveyId } : {}),
    ...sectorWhere,
  };

  const responses = await db.response.findMany({
    where,
    select: { npsScore: true },
  });

  const scores = responses.map((r) => r.npsScore!);
  if (scores.length === 0) return { score: 0, total: 0, promoters: 0, passives: 0, detractors: 0 };

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const s of scores) {
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  }

  const score = Math.round(((promoters - detractors) / scores.length) * 100);
  return { score, total: scores.length, promoters, passives, detractors };
}

/**
 * Versão cacheada de `getNpsSummary` (~5 min) para os caminhos de UI do
 * dashboard. Invalida por versão a cada nova resposta (ver bumpCacheVersion em
 * responses/actions). O cálculo direto (`getNpsSummary`) segue disponível para o
 * worker e para quem precisa de leitura sempre fresca.
 */
export async function getNpsSummaryCached(
  db: DbClient,
  tenantId: string,
  surveyId?: string,
  sectorWhere: SectorWhere = {},
): Promise<NpsSummary> {
  const version = await cacheVersion(NPS_CACHE_NS, tenantId);
  const key = npsCacheKey(version, tenantId, surveyId, sectorWhere);
  return cached(key, NPS_CACHE_TTL_SECONDS, () =>
    getNpsSummary(db, tenantId, surveyId, sectorWhere),
  );
}

export async function getResponsesByDay(
  db: DbClient,
  tenantId: string,
  days = 30,
  surveyId?: string,
  sectorWhere: SectorWhere = {},
): Promise<ResponsesByDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const responses = await db.response.findMany({
    where: {
      tenantId,
      completed: true,
      createdAt: { gte: since },
      ...(surveyId ? { surveyId } : {}),
      ...sectorWhere,
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const map = new Map<string, number>();
  for (const r of responses) {
    const day = r.createdAt.toISOString().slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

export async function getChannelBreakdown(
  db: DbClient,
  tenantId: string,
  surveyId?: string,
  sectorWhere: SectorWhere = {},
): Promise<ChannelBreakdown[]> {
  // @ts-expect-error - Prisma union type signature overload complexity
  const grouped = await db.response.groupBy({
    by: ["channel"],
    where: { tenantId, completed: true, ...(surveyId ? { surveyId } : {}), ...sectorWhere },
    _count: { channel: true },
  });
  return (
    grouped as Array<{ channel: string; _count: { channel: number } }>
  ).map((g) => ({ channel: g.channel, count: g._count.channel }));
}

export async function getRecentResponses(
  db: DbClient,
  tenantId: string,
  limit = 10,
  surveyId?: string,
  sectorWhere: SectorWhere = {},
) {
  return db.response.findMany({
    where: {
      tenantId,
      completed: true,
      ...(surveyId ? { surveyId } : {}),
      ...sectorWhere,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      channel: true,
      deviceType: true,
      npsScore: true,
      completed: true,
      survey: { select: { title: true } },
    },
  });
}

export async function getKpiCounts(
  db: DbClient,
  tenantId: string,
  sectorWhere: SectorWhere = {},
  surveySectorWhere: SectorWhere = {},
) {
  const [totalResponses, activeSurveys, openAlerts] = await Promise.all([
    db.response.count({ where: { tenantId, completed: true, ...sectorWhere } }),
    db.survey.count({ where: { tenantId, status: "PUBLISHED", ...surveySectorWhere } }),
    // Alertas são tenant-wide (não há relação direta de setor); escopados por tenant.
    db.alert.count({ where: { tenantId, status: "OPEN" } }),
  ]);
  return { totalResponses, activeSurveys, openAlerts };
}
