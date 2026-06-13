"use server";

import { requirePermission } from "@/lib/session";
import { getNpsSummary } from "@/modules/analytics/queries";
import { generateExecutiveSummary } from "@/lib/ai";
import { revalidatePath } from "next/cache";

export async function getLatestAiSummary() {
  const { ctx, db } = await requirePermission("survey:view");
  return db.executiveSummary.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function generateAiSummary() {
  const { ctx, db } = await requirePermission("survey:view");
  const tenantId = ctx.tenantId;

  // 1. Obter consolidados de NPS
  const nps = await getNpsSummary(db, tenantId);

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
  return summary;
}
