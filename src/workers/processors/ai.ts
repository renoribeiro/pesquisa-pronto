import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { analyzeSentiment, generateExecutiveSummary, generateEmbedding } from "@/lib/ai";
import { getNpsSummary } from "@/modules/analytics/queries";
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
      console.warn(`[worker:ai] job desconhecido: ${job.name}`);
      return null;
  }
}

async function analyzeResponse({ responseId, tenantId }: AnalyzeResponseJob) {
  // Load response + text answers
  const response = await prisma.response.findFirst({
    where: { id: responseId, tenantId },
    include: {
      answers: {
        include: { question: { select: { type: true } } },
      },
    },
  });
  if (!response) {
    console.warn(`[worker:ai] response ${responseId} não encontrada`);
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
    console.log(`[worker:ai] response ${responseId} sem respostas de texto para analisar`);
    return null;
  }

  try {
    const result = await analyzeSentiment(textAnswers);
    const combinedText = textAnswers.join("\n\n");
    const embedding = await generateEmbedding(combinedText);

    const analysis = await prisma.aIAnalysis.upsert({
      where: { responseId },
      update: {
        sentiment: result.sentiment,
        intensity: result.intensity,
        emotions: result.emotions,
        summary: result.summary,
      },
      create: {
        tenantId,
        responseId,
        sentiment: result.sentiment,
        intensity: result.intensity,
        emotions: result.emotions,
        summary: result.summary,
      },
    });

    // Salvar embedding via raw SQL pois o Prisma trata como Unsupported
    const embeddingString = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      'UPDATE "ai_analyses" SET "embedding" = $1::vector WHERE "id" = $2',
      embeddingString,
      analysis.id,
    );

    console.log(`[worker:ai] análise e embedding concluídos: response ${responseId} → ${result.sentiment}`);
    return result;
  } catch (err) {
    console.error(`[worker:ai] erro ao analisar response ${responseId}:`, err);
    throw err;
  }
}

async function generateSummary({ tenantId, periodStart, periodEnd }: GenerateSummaryJob) {
  try {
    const nps = await getNpsSummary(prisma, tenantId);

    const analyses = await prisma.aIAnalysis.findMany({
      where: {
        tenantId,
        processedAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
      select: { emotions: true, summary: true },
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

    const surveys = await prisma.survey.findMany({
      where: { tenantId, status: "PUBLISHED" },
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
    );

    await prisma.executiveSummary.create({
      data: {
        tenantId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        content: summaryText,
        npsAvg: nps.score,
        generatedBy: "auto",
      },
    });

    console.log(`[worker:ai] resumo executivo gerado para ${tenantId}`);
    return { summaryLength: summaryText.length };
  } catch (err) {
    console.error(`[worker:ai] erro ao gerar resumo:`, err);
    throw err;
  }
}

async function extractTopics(job: ExtractTopicsJob) {
  console.log(`[worker:ai] extract-topics para tenant ${job.tenantId} — implementação M2.3`);
  return null;
}
