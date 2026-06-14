"use server";

import { requirePermission, responseSectorWhere, surveySectorWhere } from "@/lib/session";
import { getNpsSummary } from "@/modules/analytics/queries";
import { extractTopicClusters } from "@/modules/analytics/topics";
import { getComparativeData, type ComparativeData } from "@/modules/analytics/comparative";
import { answerQuestion } from "@/modules/analytics/rag";
import { getEntityInsights as queryEntityInsights } from "@/modules/analytics/entities";
import { getAiCostSummary as queryAiCostSummary } from "@/modules/analytics/ai-cost";
import { generateExecutiveSummary, generateComparativeNarrative } from "@/lib/ai";
import { revalidatePath } from "next/cache";
import type { SessionContext } from "@/lib/session";
import type { Scope } from "@/lib/rbac";
import type { TenantClient } from "@/lib/tenant";

/**
 * Para usuários com escopo de setor, retorna os ids das pesquisas visíveis;
 * para escopo total, retorna null (sem restrição). Centraliza a regra usada
 * pelas features de IA (RAG, entidades).
 */
async function scopedSurveyIds(
  ctx: SessionContext,
  scope: Scope,
  db: TenantClient,
): Promise<string[] | null> {
  if (scope !== "sector") return null;
  const surveys = await db.survey.findMany({
    where: surveySectorWhere(ctx, scope),
    select: { id: true },
  });
  return surveys.map((s) => s.id);
}

export async function getLatestAiSummary() {
  const { ctx, db } = await requirePermission("survey:view");
  return db.executiveSummary.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Lê o snapshot de temas (clusters) tenant-wide, ordenado por volume.
 * Temas são um agregado anônimo de nível de tenant (apenas rótulos), exposto a
 * quem tem escopo total — não é particionado por setor (ver generateTopicClusters).
 */
export async function getTopicClusters() {
  const { db, scope } = await requirePermission("survey:view");
  if (scope !== "all") return [];
  return db.topicCluster.findMany({ where: { surveyId: null }, orderBy: { volume: "desc" } });
}

/**
 * Extrai temas recorrentes dos comentários dos últimos 30 dias usando os
 * embeddings já gravados. Os temas são um agregado tenant-wide (rótulos
 * anônimos como "Tempo de espera"); o modelo TopicCluster não representa um
 * snapshot por-setor, então a geração é tenant-wide e restrita a escopo total.
 */
export async function generateTopicClusters() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  if (scope !== "all") {
    throw new Error("A geração de temas está disponível apenas para administradores da clínica.");
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 3600 * 1000);

  await extractTopicClusters({
    db,
    tenantId: ctx.tenantId,
    periodStart,
    periodEnd,
    // tenant-wide: sem filtro de entrada, snapshot tag = surveyId null.
  });

  revalidatePath("/admin/analytics");
  return db.topicCluster.findMany({ where: { surveyId: null }, orderBy: { volume: "desc" } });
}

/**
 * Filtro por tema: retorna os comentários-amostra (resumos de IA) das respostas
 * representativas de um tema. Tenant-wide (rótulos anônimos) → escopo total.
 */
export async function getTopicSamples(
  topicId: string,
): Promise<{ label: string; samples: string[] }> {
  const { db, scope } = await requirePermission("survey:view");
  if (scope !== "all") {
    throw new Error("Detalhe de temas disponível apenas para administradores da clínica.");
  }

  const topic = await db.topicCluster.findFirst({
    where: { id: topicId },
    select: { label: true, sampleResponseIds: true },
  });
  if (!topic) throw new Error("Tema não encontrado.");

  const ids = Array.isArray(topic.sampleResponseIds) ? (topic.sampleResponseIds as string[]) : [];
  if (ids.length === 0) return { label: topic.label, samples: [] };

  const analyses = await db.aIAnalysis.findMany({
    where: { responseId: { in: ids } },
    select: { summary: true },
  });
  const samples = analyses
    .map((a) => a.summary)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  return { label: topic.label, samples };
}

export async function generateAiSummary() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const tenantId = ctx.tenantId;
  const sectorWhere = responseSectorWhere(ctx, scope);

  // 1. Obter consolidados de NPS (escopado por setor quando aplicável)
  const nps = await getNpsSummary(db, tenantId, undefined, sectorWhere);

  // 2. Buscar análises de IA recentes para extrair emoções e resumos.
  //    ESCOPO DE SETOR: AIAnalysis liga-se ao setor via response.survey.sectors,
  //    então o filtro de Response (responseSectorWhere) é aplicado sob `response`.
  //    Sem isto, um SECTOR_MANAGER receberia emoções/comentários de outros setores.
  const analysisSectorWhere =
    scope === "sector" ? { response: responseSectorWhere(ctx, scope) } : {};
  const analyses = await db.aIAnalysis.findMany({
    where: { tenantId, ...analysisSectorWhere },
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
    { tenantId, jobType: "summary" },
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

/**
 * Análise comparativa temporal (M2.4): compara o período atual com o anterior
 * (mesma duração) e gera uma narrativa via IA sobre variações de NPS, volume,
 * sentimento e possíveis sazonalidades. Respeita o escopo de setor.
 */
export async function generateComparison(): Promise<{
  data: ComparativeData;
  narrative: string;
}> {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const sectorWhere = responseSectorWhere(ctx, scope);

  const data = await getComparativeData(db, ctx.tenantId, { days: 30, sectorWhere });

  const narrative = await generateComparativeNarrative(
    {
      days: data.days,
      current: {
        nps: data.current.nps,
        total: data.current.total,
        positive: data.current.positive,
        negative: data.current.negative,
        neutral: data.current.neutral,
      },
      previous: {
        nps: data.previous.nps,
        total: data.previous.total,
        positive: data.previous.positive,
        negative: data.previous.negative,
        neutral: data.previous.neutral,
      },
    },
    { tenantId: ctx.tenantId, jobType: "comparison" },
  );

  return { data, narrative };
}

/**
 * RAG — "Pergunte aos seus dados": responde uma pergunta do gestor com base
 * nos comentários de pacientes (escopado por setor). Limita o tamanho da
 * pergunta para conter custo/abuso.
 */
export async function askData(question: string) {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const q = String(question ?? "").trim().slice(0, 500);
  if (!q) return { answer: "Faça uma pergunta sobre os comentários dos pacientes.", sources: [] };
  const surveyIds = await scopedSurveyIds(ctx, scope, db);
  return answerQuestion(db, ctx.tenantId, q, {
    surveyIds: surveyIds ?? undefined,
    usageCtx: { tenantId: ctx.tenantId, jobType: "rag" },
  });
}

/** Entidades clínicas mencionadas (médico/setor/procedimento) cruzadas com NPS. */
export async function getEntityInsights() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const surveyIds = await scopedSurveyIds(ctx, scope, db);
  return queryEntityInsights(db, ctx.tenantId, { surveyIds: surveyIds ?? undefined });
}

/**
 * Resumo de custo de IA dos últimos 30 dias. Métrica tenant-wide (AIUsageLog
 * não é setorizável) — exposta apenas a quem tem escopo total.
 */
export async function getAiCostSummary() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  if (scope !== "all") {
    return { totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, byJobType: [], sinceDays: 30 };
  }
  return queryAiCostSummary(db, ctx.tenantId, 30);
}
