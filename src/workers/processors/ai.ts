import type { Job } from "bullmq";
import { forTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { captureException, captureMessage } from "@/lib/observability";
import { analyzeSentiment, generateExecutiveSummary, generateEmbedding } from "@/lib/ai";
import { getNpsSummary } from "@/modules/analytics/queries";
import { extractTopicClusters } from "@/modules/analytics/topics";
import type { AnalyzeResponseJob, GenerateSummaryJob, ExtractTopicsJob } from "@/server/queues";

export async function processAi(job: Job): Promise<unknown> {
  switch (job.name) {
    case "analyze-response":
      return analyzeResponse(job.data as AnalyzeResponseJob);
    case "generate-summary":
      return generateSummary(job.data as GenerateSummaryJob);
    case "extract-topics":
      return extractTopics(job.data as ExtractTopicsJob);
    default:
      captureMessage(`[worker:ai] job desconhecido: ${job.name}`);
      return null;
  }
}

async function analyzeResponse({ responseId, tenantId }: AnalyzeResponseJob) {
  const db = forTenant(tenantId);

  // Load response + text answers
  const response = await db.response.findFirst({
    where: { id: responseId },
    include: {
      answers: {
        include: { question: { select: { type: true } } },
      },
    },
  });
  if (!response) {
    logger.warn(`[worker:ai] response ${responseId} não encontrada`);
    return null;
  }

  // Extract text answers
  const textAnswers = response.answers
    .filter((a) => a.question.type === "TEXT" || a.question.type === "STAR_RATING_TEXT")
    .map((a) => {
      const v = a.value;
      if (typeof v === "string") return v;
      if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
      return null;
    })
    .filter((t): t is string => t !== null && t.trim().length > 0);

  if (textAnswers.length === 0) {
    logger.info(`[worker:ai] response ${responseId} sem respostas de texto para analisar`);
    return null;
  }

  try {
    const result = await analyzeSentiment(textAnswers, { tenantId, jobType: "sentiment" });
    const combinedText = textAnswers.join("\n\n");
    const embedding = await generateEmbedding(combinedText, { tenantId, jobType: "embedding" });

    const analysis = await db.aIAnalysis.upsert({
      where: { responseId },
      update: {
        sentiment: result.sentiment,
        intensity: result.intensity,
        emotions: result.emotions,
        entities: result.entities,
        summary: result.summary,
      },
      create: {
        tenantId,
        responseId,
        sentiment: result.sentiment,
        intensity: result.intensity,
        emotions: result.emotions,
        entities: result.entities,
        summary: result.summary,
      },
    });

    // Salvar embedding via raw SQL pois o Prisma trata como Unsupported.
    // Escopar por tenantId para reforçar o isolamento multitenant.
    const embeddingString = `[${embedding.join(",")}]`;
    await db.$executeRawUnsafe(
      'UPDATE "ai_analyses" SET "embedding" = $1::vector WHERE "id" = $2 AND "tenantId" = $3',
      embeddingString,
      analysis.id,
      tenantId,
    );

    logger.info(`[worker:ai] análise e embedding concluídos: response ${responseId} → ${result.sentiment}`);
    return result;
  } catch (err) {
    captureException(err, { context: "analyze-response", responseId, tenantId });
    throw err;
  }
}

async function generateSummary({ tenantId, periodStart, periodEnd, generatedBy }: GenerateSummaryJob) {
  const db = forTenant(tenantId);

  try {
    const nps = await getNpsSummary(db, tenantId);

    const analyses = await db.aIAnalysis.findMany({
      where: {
        processedAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
      select: { emotions: true, summary: true },
      orderBy: { processedAt: "desc" }, // determinístico: as 50 análises mais recentes
      take: 50,
    });

    const allEmotions = analyses.flatMap((a) =>
      Array.isArray(a.emotions) ? (a.emotions as string[]) : [],
    );
    const emotionCounts = new Map<string, number>();
    for (const e of allEmotions) emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);
    const topEmotions = [...emotionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([e]) => e);

    const recentComments = analyses
      .filter((a) => a.summary)
      .slice(0, 5)
      .map((a) => a.summary as string);

    const surveys = await db.survey.findMany({
      where: { status: "PUBLISHED" },
      select: { title: true },
      take: 1,
    });
    const surveyTitle = surveys[0]?.title ?? "Pesquisa de Satisfação";

    const summaryText = await generateExecutiveSummary(
      surveyTitle,
      nps.score,
      nps.total,
      topEmotions,
      recentComments,
      { tenantId, jobType: "summary" },
    );

    await db.executiveSummary.create({
      data: {
        tenantId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        content: summaryText,
        npsAvg: nps.score,
        generatedBy: generatedBy ?? "auto",
      },
    });

    logger.info(`[worker:ai] resumo executivo gerado para ${tenantId}`);
    return { summaryLength: summaryText.length };
  } catch (err) {
    captureException(err, { context: "generate-summary", tenantId });
    throw err;
  }
}

async function extractTopics({ tenantId, surveyId, periodStart, periodEnd }: ExtractTopicsJob) {
  const db = forTenant(tenantId);
  try {
    const count = await extractTopicClusters({
      db,
      tenantId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      surveyIds: surveyId ? [surveyId] : null,
      surveyId: surveyId ?? null,
    });
    logger.info(`[worker:ai] extract-topics: ${count} temas para tenant ${tenantId}`);
    return { topics: count };
  } catch (err) {
    captureException(err, { context: "extract-topics", tenantId });
    throw err;
  }
}
