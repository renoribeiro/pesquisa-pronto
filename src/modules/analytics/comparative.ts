import type { DbClient, SectorWhere } from "./queries";

/**
 * Dados de análise comparativa temporal: agrega NPS, volume e distribuição de
 * sentimento de dois períodos consecutivos de mesma duração (atual vs anterior),
 * que alimentam a narrativa de variações/sazonalidades gerada por IA (M2.4).
 */

export interface PeriodStats {
  nps: number;
  total: number;
  promoters: number;
  detractors: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface ComparativeData {
  days: number;
  current: PeriodStats;
  previous: PeriodStats;
  currentRange: { from: string; to: string };
  previousRange: { from: string; to: string };
}

async function npsForRange(
  db: DbClient,
  tenantId: string,
  from: Date,
  to: Date,
  sectorWhere: SectorWhere,
): Promise<{ nps: number; total: number; promoters: number; detractors: number }> {
  const responses = await db.response.findMany({
    where: {
      tenantId,
      completed: true,
      npsScore: { not: null },
      createdAt: { gte: from, lt: to },
      ...sectorWhere,
    },
    select: { npsScore: true },
  });
  const total = responses.length;
  if (total === 0) return { nps: 0, total: 0, promoters: 0, detractors: 0 };
  let promoters = 0;
  let detractors = 0;
  for (const r of responses) {
    const s = r.npsScore as number;
    if (s >= 9) promoters += 1;
    else if (s <= 6) detractors += 1;
  }
  return { nps: Math.round(((promoters - detractors) / total) * 100), total, promoters, detractors };
}

async function sentimentForRange(
  db: DbClient,
  tenantId: string,
  from: Date,
  to: Date,
  analysisWhere: SectorWhere,
): Promise<{ positive: number; negative: number; neutral: number }> {
  const rows = await db.aIAnalysis.findMany({
    where: { tenantId, processedAt: { gte: from, lt: to }, ...analysisWhere },
    select: { sentiment: true },
  });
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  for (const r of rows) {
    if (r.sentiment === "POSITIVE") positive += 1;
    else if (r.sentiment === "NEGATIVE") negative += 1;
    else neutral += 1; // NEUTRAL + MIXED
  }
  return { positive, negative, neutral };
}

export async function getComparativeData(
  db: DbClient,
  tenantId: string,
  opts: { days?: number; sectorWhere?: SectorWhere } = {},
): Promise<ComparativeData> {
  const days = opts.days ?? 30;
  const sectorWhere = opts.sectorWhere ?? {};
  // Sentimento filtra por setor via relação `response`.
  const analysisWhere: SectorWhere =
    Object.keys(sectorWhere).length > 0 ? { response: sectorWhere } : {};

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const currentTo = new Date(now);
  const currentFrom = new Date(now - days * dayMs);
  const previousTo = currentFrom;
  const previousFrom = new Date(now - 2 * days * dayMs);

  const [curNps, prevNps, curSent, prevSent] = await Promise.all([
    npsForRange(db, tenantId, currentFrom, currentTo, sectorWhere),
    npsForRange(db, tenantId, previousFrom, previousTo, sectorWhere),
    sentimentForRange(db, tenantId, currentFrom, currentTo, analysisWhere),
    sentimentForRange(db, tenantId, previousFrom, previousTo, analysisWhere),
  ]);

  return {
    days,
    current: { ...curNps, ...curSent },
    previous: { ...prevNps, ...prevSent },
    currentRange: { from: currentFrom.toISOString(), to: currentTo.toISOString() },
    previousRange: { from: previousFrom.toISOString(), to: previousTo.toISOString() },
  };
}
