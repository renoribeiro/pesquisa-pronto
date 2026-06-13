"use server";

import { requirePermission, responseSectorWhere, surveySectorWhere } from "@/lib/session";
import { getNpsSummary } from "@/modules/analytics/queries";
import { extractTopicClusters } from "@/modules/analytics/topics";
import { generateExecutiveSummary } from "@/lib/ai";
import { revalidatePath } from "next/cache";

export async function getLatestAiSummary() {
  const { ctx, db } = await requirePermission("survey:view");
  return db.executiveSummary.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/** Lê os temas (clusters) atuais, ordenados por volume. */
export async function getTopicClusters() {
  const { db } = await requirePermission("survey:view");
  return db.topicCluster.findMany({ orderBy: { volume: "desc" } });
}

/**
 * Extrai temas recorrentes dos comentários dos últimos 30 dias usando os
 * embeddings já gravados. Respeita o escopo de setor do usuário.
 */
export async function generateTopicClusters() {
  const { ctx, db, scope } = await requirePermission("survey:view");

  // Escopo de setor: restringe às pesquisas dos setores do usuário.
  let surveyIds: string[] | null = null;
  if (scope === "sector") {
    const surveys = await db.survey.findMany({
      where: surveySectorWhere(ctx, scope),
      select: { id: true },
    });
    surveyIds = surveys.map((s) => s.id);
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 3600 * 1000);

  await extractTopicClusters({
    db,
    tenantId: ctx.tenantId,
    periodStart,
    periodEnd,
    surveyIds,
  });

  revalidatePath("/admin/analytics");
  return db.topicCluster.findMany({ orderBy: { volume: "desc" } });
}

export async function generateAiSummary() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const tenantId = ctx.tenantId;
  const sectorWhere = responseSectorWhere(ctx, scope);

  // 1. Obter consolidados de NPS (escopado por setor quando aplicável)
  const nps = await getNpsSummary(db, tenantId, undefined, sectorWhere);

  // 2. Buscar análises de IA recentes para extrair emoções e resumos
  const analyses = await db.aIAnalysis.findMany({
    where: { tenantId },
    select: { emotions: true, summary: true },
    orderBy: { processedAt: "desc" },
    take: 50,
  });

  const allEmotions = analyses.flatMap((a) =>
    Array.isArray(a.emotions) ? (a.emotions as string[]) : [],
  );
  const emotionCounts = new Map<string, number>();
  for (const e of allEmotions) {
    emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);
  }
  const topEmotions = [...emotionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  const recentComments = analyses
    .filter((a) => a.summary)
    .slice(0, 5)
    .map((a) => a.summary as string);

  // Obter o título da primeira pesquisa publicada ativa
  const surveys = await db.survey.findMany({
    where: { tenantId, status: "PUBLISHED" },
    select: { title: true },
    take: 1,
  });
  const surveyTitle = surveys[0]?.title ?? "Pesquisa de Satisfação";

  // Gerar resumo executivo chamando Claude API
  const summaryText = await generateExecutiveSummary(
    surveyTitle,
    nps.score,
    nps.total,
    topEmotions,
    recentComments,
  );

  // Salvar no banco
  const summary = await db.executiveSummary.create({
    data: {
      tenantId,
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000), // últimos 30 dias
      periodEnd: new Date(),
      content: summaryText,
      npsAvg: nps.score,
      generatedBy: "manual",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  return summary;
}
