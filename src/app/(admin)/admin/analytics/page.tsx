import { requirePermission, responseSectorWhere, surveySectorWhere } from "@/lib/session";
import {
  getNpsSummaryCached,
  getResponsesByDay,
  getChannelBreakdown,
  getRecentResponses,
} from "@/modules/analytics/queries";
import { getEntityInsights } from "@/modules/analytics/entities";
import { getAiCostSummary } from "@/modules/analytics/ai-cost";
import {
  NpsCard,
  ResponseTrendChart,
  ChannelChart,
  RecentResponsesFeed,
} from "@/modules/analytics/components/analytics-dashboard";
import { TopicClustersWidget } from "@/modules/analytics/components/topic-clusters";
import { ComparativeInsightsWidget } from "@/modules/analytics/components/comparative-insights";
import { AskDataWidget } from "@/modules/analytics/components/ask-data";
import { EntityInsightsWidget } from "@/modules/analytics/components/entity-insights";
import { AiCostWidget } from "@/modules/analytics/components/ai-cost";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Analytics — Pronto Satisfação" };

export default async function AnalyticsPage() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const sectorWhere = responseSectorWhere(ctx, scope);

  // Ids de pesquisa visíveis (para escopo de setor nas features de IA).
  let surveyIds: string[] | undefined;
  if (scope === "sector") {
    const surveys = await db.survey.findMany({ where: surveySectorWhere(ctx, scope), select: { id: true } });
    surveyIds = surveys.map((s) => s.id);
  }

  // Temas e custo de IA são agregados tenant-wide (rótulos anônimos / métrica
  // não-setorizável): expostos apenas a quem tem escopo total. Features
  // setorizáveis (NPS, entidades, RAG) respeitam o escopo de setor.
  const showTenantAggregates = scope === "all";

  const [nps, trend, channels, recent, topics, entities, aiCost] = await Promise.all([
    getNpsSummaryCached(db, ctx.tenantId, undefined, sectorWhere),
    getResponsesByDay(db, ctx.tenantId, 30, undefined, sectorWhere),
    getChannelBreakdown(db, ctx.tenantId, undefined, sectorWhere),
    getRecentResponses(db, ctx.tenantId, 10, undefined, sectorWhere),
    showTenantAggregates
      ? db.topicCluster.findMany({ where: { surveyId: null }, orderBy: { volume: "desc" } })
      : Promise.resolve([]),
    getEntityInsights(db, ctx.tenantId, { surveyIds }),
    showTenantAggregates ? getAiCostSummary(db, ctx.tenantId, 30) : Promise.resolve(null),
  ]);

  const topicViews = topics.map((t) => ({
    id: t.id,
    label: t.label,
    volume: t.volume,
    sentiment: t.sentiment as "POSITIVE" | "NEUTRAL" | "NEGATIVE",
    trend: t.trend,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <NpsCard data={nps} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total de respostas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nps.total}</div>
          </CardContent>
        </Card>
        <ChannelChart data={channels} />
      </div>

      {/* Trend chart */}
      <ResponseTrendChart data={trend} />

      {/* Temas recorrentes (clustering por IA dos embeddings) — agregado tenant-wide */}
      {showTenantAggregates && <TopicClustersWidget initialClusters={topicViews} />}

      {/* Análise comparativa temporal (período atual vs anterior) com narrativa por IA */}
      <ComparativeInsightsWidget />

      {/* Pergunte aos seus dados (RAG) */}
      <AskDataWidget />

      {/* Entidades clínicas mencionadas (médico/setor/procedimento) × NPS */}
      <EntityInsightsWidget initialEntities={entities} />

      {/* Observabilidade de custo de IA (apenas escopo total) */}
      {aiCost && <AiCostWidget summary={aiCost} />}

      {/* Recent responses */}
      <RecentResponsesFeed data={recent} />
    </div>
  );
}
