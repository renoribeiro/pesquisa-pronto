/**
 * Clustering de temas a partir de embeddings (pgvector / OpenAI
 * text-embedding-3-small, 1536 dim, vetores normalizados).
 *
 * Algoritmo: agglomerativo guloso por limiar de similaridade de cosseno —
 * sem dependências externas e adequado para o volume de uma clínica (centenas
 * a milhares de respostas). Cada item é atribuído ao cluster cujo centróide é
 * mais similar (acima do limiar); caso contrário inicia um novo cluster. O
 * centróide é a média incremental dos embeddings dos membros.
 */

export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface EmbeddedItem {
  id: string;
  responseId: string;
  sentiment: Sentiment;
  summary: string | null;
  embedding: number[];
}

export interface Cluster {
  members: EmbeddedItem[];
  centroid: number[];
}

/** Limiar de cosseno para considerar dois textos "do mesmo tema". Ajustável. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;

/** Produto interno. Embeddings da OpenAI são normalizados (norma 1). */
function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1;
}

/** Similaridade de cosseno em [-1, 1] (robusta a vetores não-normalizados). */
export function cosine(a: number[], b: number[]): number {
  return dot(a, b) / (norm(a) * norm(b));
}

interface ClusterOptions {
  threshold?: number;
  /** Tamanho mínimo de um cluster para ser considerado um "tema". */
  minSize?: number;
  /** Número máximo de temas retornados (os de maior volume). */
  maxClusters?: number;
}

/**
 * Agrupa itens por similaridade de cosseno (agglomerativo guloso).
 * Retorna os clusters com `members.length >= minSize`, ordenados por volume
 * decrescente e limitados a `maxClusters`.
 */
export function clusterByThreshold(items: EmbeddedItem[], opts: ClusterOptions = {}): Cluster[] {
  const threshold = opts.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const minSize = opts.minSize ?? 2;
  const maxClusters = opts.maxClusters ?? 15;

  const clusters: Cluster[] = [];

  for (const item of items) {
    if (item.embedding.length === 0) continue;

    let best: Cluster | null = null;
    let bestSim = threshold;
    for (const c of clusters) {
      const sim = cosine(item.embedding, c.centroid);
      if (sim >= bestSim) {
        bestSim = sim;
        best = c;
      }
    }

    if (best) {
      // Atualiza o centróide como média incremental.
      const n = best.members.length;
      const centroid = best.centroid;
      for (let i = 0; i < centroid.length; i++) {
        centroid[i] = (centroid[i] * n + item.embedding[i]) / (n + 1);
      }
      best.members.push(item);
    } else {
      clusters.push({ members: [item], centroid: [...item.embedding] });
    }
  }

  return clusters
    .filter((c) => c.members.length >= minSize)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, maxClusters);
}

/** Sentimento dominante (maioria) entre os membros de um cluster. */
export function dominantSentiment(members: EmbeddedItem[]): Sentiment {
  const counts: Record<Sentiment, number> = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  for (const m of members) counts[m.sentiment]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Sentiment) ?? "NEUTRAL";
}

/**
 * Conta quantos itens do conjunto fornecido pertenceriam ao cluster definido
 * por `centroid` (similaridade >= limiar). Usado para calcular a tendência
 * comparando o volume do período atual com o período anterior.
 */
export function countMatches(centroid: number[], items: EmbeddedItem[], threshold = DEFAULT_SIMILARITY_THRESHOLD): number {
  let n = 0;
  for (const it of items) {
    if (it.embedding.length && cosine(centroid, it.embedding) >= threshold) n++;
  }
  return n;
}

/**
 * Tendência percentual do volume atual vs. anterior.
 * - anterior 0 e atual > 0 → +100 (tema emergente)
 * - ambos 0 → 0
 */
export function computeTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
