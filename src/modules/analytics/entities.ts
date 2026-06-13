import type { TenantClient } from "@/lib/tenant";

/**
 * Insight agregado por entidade clínica (médico, setor, procedimento) cruzado com NPS.
 *
 * As entidades vêm de `ai_analyses.entities` (Json — array de `{ type, name }`),
 * produzidas por `analyzeSentiment`. Aqui cada menção é cruzada com o `npsScore`
 * da resposta e o `sentiment` da análise.
 */
export interface EntityInsight {
  type: string;
  name: string;
  mentions: number;
  /** Média da NOTA (0-10) das respostas que mencionam a entidade (null se nenhuma com nota). */
  avgScore: number | null;
  /** Fração de menções em respostas com sentimento NEGATIVE (0..1). */
  negativeRate: number;
}

/** Máx. de análises recentes amostradas para a agregação de entidades. */
const ENTITY_ANALYSIS_SAMPLE = 5000;

interface RawEntity {
  type?: unknown;
  name?: unknown;
}

interface Agg {
  type: string;
  name: string;
  mentions: number;
  npsSum: number;
  npsCount: number;
  negativeCount: number;
}

export async function getEntityInsights(
  db: TenantClient,
  tenantId: string,
  opts?: { surveyIds?: string[] },
): Promise<EntityInsight[]> {
  void tenantId; // escopo de tenant já é injetado pelo guard `db`.

  const rows = await db.aIAnalysis.findMany({
    where: opts?.surveyIds ? { response: { surveyId: { in: opts.surveyIds } } } : {},
    select: {
      entities: true,
      sentiment: true,
      response: { select: { npsScore: true } },
    },
    // Ordenação determinística: ao truncar em `take`, pega-se sempre as
    // análises mais recentes (não uma fatia arbitrária do Postgres).
    // Aproximação deliberada: agrega as N análises mais recentes em memória (a
    // UI sinaliza "análises mais recentes"). Suficiente para o porte atual; a
    // longo prazo, migrar para agregação no banco (jsonb_array_elements) quando
    // o volume exigir.
    orderBy: { processedAt: "desc" },
    take: ENTITY_ANALYSIS_SAMPLE,
  });

  const byKey = new Map<string, Agg>();

  for (const row of rows) {
    const list = row.entities;
    if (!Array.isArray(list)) continue;

    const npsScore = row.response?.npsScore;
    const isNegative = row.sentiment === "NEGATIVE";

    // Deduplica chaves repetidas DENTRO da mesma análise: uma entidade citada
    // 2x na mesma resposta conta como 1 menção (não infla mentions/avgScore).
    const seenInRow = new Set<string>();

    for (const item of list as RawEntity[]) {
      if (!item || typeof item !== "object") continue;
      const type = typeof item.type === "string" ? item.type : null;
      const name = typeof item.name === "string" ? item.name : null;
      if (!type || !name) continue;

      const key = `${type}|${name.toLowerCase()}`;
      if (seenInRow.has(key)) continue;
      seenInRow.add(key);

      let agg = byKey.get(key);
      if (!agg) {
        agg = { type, name, mentions: 0, npsSum: 0, npsCount: 0, negativeCount: 0 };
        byKey.set(key, agg);
      }

      agg.mentions += 1;
      if (typeof npsScore === "number") {
        agg.npsSum += npsScore;
        agg.npsCount += 1;
      }
      if (isNegative) agg.negativeCount += 1;
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 20)
    .map((agg) => ({
      type: agg.type,
      name: agg.name,
      mentions: agg.mentions,
      // 1 casa decimal: preserva o corte promotor/passivo/detrator (ex.: 6.5 não
      // vira 7 "passivo"). A UI exibe com toFixed(1).
      avgScore: agg.npsCount > 0 ? Math.round((agg.npsSum / agg.npsCount) * 10) / 10 : null,
      negativeRate: agg.mentions > 0 ? agg.negativeCount / agg.mentions : 0,
    }));
}
