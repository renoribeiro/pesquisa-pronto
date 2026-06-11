import type { PrismaClient } from "@prisma/client";

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

export async function getNpsSummary(
  db: PrismaClient,
  tenantId: string,
  surveyId?: string,
): Promise<NpsSummary> {
  const where = {
    tenantId,
    completed: true,
    npsScore: { not: null },
    ...(surveyId ? { surveyId } : {}),
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

export async function getResponsesByDay(
  db: PrismaClient,
  tenantId: string,
  days = 30,
  surveyId?: string,
): Promise<ResponsesByDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const responses = await db.response.findMany({
    where: {
      tenantId,
      completed: true,
      createdAt: { gte: since },
      ...(surveyId ? { surveyId } : {}),
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
  db: PrismaClient,
  tenantId: string,
  surveyId?: string,
): Promise<ChannelBreakdown[]> {
  const grouped = await db.response.groupBy({
    by: ["channel"],
    where: { tenantId, completed: true, ...(surveyId ? { surveyId } : {}) },
    _count: { channel: true },
  });
  return grouped.map((g) => ({ channel: g.channel, count: g._count.channel }));
}

export async function getRecentResponses(
  db: PrismaClient,
  tenantId: string,
  limit = 10,
  surveyId?: string,
) {
  return db.response.findMany({
    where: {
      tenantId,
      completed: true,
      ...(surveyId ? { surveyId } : {}),
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

export async function getKpiCounts(db: PrismaClient, tenantId: string) {
  const [totalResponses, activeSurveys, openAlerts] = await Promise.all([
    db.response.count({ where: { tenantId, completed: true } }),
    db.survey.count({ where: { tenantId, status: "PUBLISHED" } }),
    db.alert.count({ where: { tenantId, status: "OPEN" } }),
  ]);
  return { totalResponses, activeSurveys, openAlerts };
}
