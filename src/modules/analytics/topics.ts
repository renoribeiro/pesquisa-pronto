import { withTenant, type TenantClient } from "@/lib/tenant";
import { labelTopicClusters } from "@/lib/ai";
import {
  clusterByThreshold,
  countMatches,
  computeTrend,
  dominantSentiment,
  type EmbeddedItem,
  type Sentiment,
} from "@/lib/topics";

interface RawRow {
  id: string;
  responseId: string;
  sentiment: Sentiment;
  summary: string | null;
  embedding: string; // "[0.1,0.2,...]" (vector::text)
}

/** Lê os embeddings de AIAnalysis de um período via raw SQL (pgvector → text). */
async function fetchEmbeddedItems(
  db: TenantClient,
  tenantId: string,
  start: Date,
  end: Date,
  surveyIds: string[] | null | undefined,
): Promise<EmbeddedItem[]> {
  const params: unknown[] = [tenantId, start, end];
  let surveyFilter = "";
  if (surveyIds) {
    params.push(surveyIds);
    surveyFilter = `AND r."surveyId" = ANY($4::text[])`;
  }

  const sql = `
    SELECT a."id", a."responseId", a."sentiment"::text AS sentiment, a."summary", a."embedding"::text AS embedding
    FROM "ai_analyses" a
    JOIN "responses" r ON r."id" = a."responseId" AND r."tenantId" = $1
    WHERE a."tenantId" = $1
      AND a."embedding" IS NOT NULL
      AND a."processedAt" >= $2 AND a."processedAt" <= $3
      ${surveyFilter}
  `;

  const rows = (await db.$queryRawUnsafe(sql, ...params)) as RawRow[];

  return rows
    .map((r) => {
      let embedding: number[] = [];
      try {
        embedding = JSON.parse(r.embedding) as number[];
      } catch {
        embedding = [];
      }
      return {
        id: r.id,
        responseId: r.responseId,
        sentiment: r.sentiment,
        summary: r.summary,
        embedding,
      };
    })
    .filter((it) => it.embedding.length > 0);
}

export interface ExtractTopicsOptions {
  db: TenantClient;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  /** Filtro de pesquisas (escopo de setor; null/undefined = todas do tenant). */
  surveyIds?: string[] | null;
  /** Valor gravado em TopicCluster.surveyId (quando a extração é de 1 pesquisa). */
  surveyId?: string | null;
}

/**
 * Extrai temas recorrentes dos comentários de um período, agrupando por
 * similaridade de embeddings, rotulando via Claude e calculando a tendência
 * vs. o período anterior. Persiste o snapshot atual em `TopicCluster`
 * (substituindo o anterior do tenant). Retorna o nº de temas criados.
 */
export async function extractTopicClusters(opts: ExtractTopicsOptions): Promise<number> {
  const { db, tenantId, periodStart, periodEnd, surveyIds, surveyId } = opts;

  // Período anterior de mesma duração (para tendência).
  const durationMs = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - durationMs);
  const prevEnd = periodStart;

  const [current, previous] = await Promise.all([
    fetchEmbeddedItems(db, tenantId, periodStart, periodEnd, surveyIds),
    fetchEmbeddedItems(db, tenantId, prevStart, prevEnd, surveyIds),
  ]);

  const clusters = clusterByThreshold(current);

  // A TAG do snapshot (coluna surveyId) é `surveyId ?? null` — uma pesquisa
  // específica (worker) ou tenant-wide (null). O recorte de deleção DEVE casar
  // exatamente essa tag, NÃO o filtro de entrada `surveyIds` (que só restringe
  // quais respostas alimentam o clustering). Tag ≡ delete garante substituição
  // idempotente do snapshot, sem acúmulo nem mistura de escopos.
  const deleteWhere = surveyId ? { surveyId } : { surveyId: null };

  if (clusters.length === 0) {
    await db.topicCluster.deleteMany({ where: deleteWhere });
    return 0;
  }

  // Rótulos ANTES da transação (chamada de rede ao Claude): se a IA falhar, o
  // snapshot existente não é destruído.
  const samples = clusters.map((c) =>
    c.members.map((m) => m.summary ?? "").filter((s) => s.trim().length > 0),
  );
  const labels = await labelTopicClusters(samples, { tenantId, jobType: "topics" });

  // delete + create na MESMA transação: evita janela sem temas.
  await withTenant(tenantId, async (tx) => {
    await tx.topicCluster.deleteMany({ where: deleteWhere });
    await Promise.all(
      clusters.map((c, i) => {
        const volume = c.members.length;
        const prevVolume = countMatches(c.centroid, previous);
        return tx.topicCluster.create({
          data: {
            tenantId,
            surveyId: surveyId ?? null,
            label: labels[i],
            volume,
            sentiment: dominantSentiment(c.members),
            trend: computeTrend(volume, prevVolume),
            periodStart,
            periodEnd,
            sampleResponseIds: c.members.slice(0, 5).map((m) => m.responseId),
          },
        });
      }),
    );
  });

  return clusters.length;
}
