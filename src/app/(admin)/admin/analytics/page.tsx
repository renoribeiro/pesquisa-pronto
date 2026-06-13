import { requirePermission, responseSectorWhere } from "@/lib/session";
import {
  getNpsSummary,
  getResponsesByDay,
  getChannelBreakdown,
  getRecentResponses,
} from "@/modules/analytics/queries";
import {
  NpsCard,
  ResponseTrendChart,
  ChannelChart,
  RecentResponsesFeed,
} from "@/modules/analytics/components/analytics-dashboard";
import { TopicClustersWidget } from "@/modules/analytics/components/topic-clusters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Analytics — Pronto Satisfação" };

export default async function AnalyticsPage() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const sectorWhere = responseSectorWhere(ctx, scope);

  const [nps, trend, channels, recent, topics] = await Promise.all([
    getNpsSummary(db as Parameters<typeof getNpsSummary>[0], ctx.tenantId, undefined, sectorWhere),
    getResponsesByDay(db as Parameters<typeof getResponsesByDay>[0], ctx.tenantId, 30, undefined, sectorWhere),
    getChannelBreakdown(db as Parameters<typeof getChannelBreakdown>[0], ctx.tenantId, undefined, sectorWhere),
    getRecentResponses(db as Parameters<typeof getRecentResponses>[0], ctx.tenantId, 10, undefined, sectorWhere),
    db.topicCluster.findMany({ orderBy: { volume: "desc" } }),
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

      {/* Temas recorrentes (clustering por IA dos embeddings) */}
      <TopicClustersWidget initialClusters={topicViews} />

      {/* Recent responses */}
      <RecentResponsesFeed data={recent} />
    </div>
  );
}
