import type { TenantClient } from "@/lib/tenant";
import { generateEmbedding, answerFromContext, type RagContext } from "@/lib/ai";
import type { AiUsageCtx } from "@/lib/ai-usage";

interface AnswerQuestionOpts {
  surveyIds?: string[];
  k?: number;
  usageCtx?: AiUsageCtx;
}

interface AnswerQuestionResult {
  answer: string;
  sources: { responseId: string; text: string }[];
}

type RagRow = { responseId: string; summary: string | null };

/**
 * "Pergunte aos seus dados" — RAG sobre os embeddings dos comentários de
 * pacientes (pgvector). Gera o embedding da pergunta, busca os top-k resumos
 * mais semelhantes e responde citando os trechos usados.
 */
export async function answerQuestion(
  db: TenantClient,
  tenantId: string,
  question: string,
  opts?: AnswerQuestionOpts,
): Promise<AnswerQuestionResult> {
  // Pergunta vazia: não embute vetor zero (a distância de cosseno contra vetor
  // de norma zero é indefinida no pgvector). Retorna cedo.
  if (!question.trim()) {
    return { answer: "Faça uma pergunta sobre os comentários dos pacientes.", sources: [] };
  }

  // Distingue "sem restrição" (undefined → vê tudo do tenant) de "lista de
  // permissão explícita" (array, mesmo vazio). Uma lista vazia significa
  // "não vê nada" — não invertê-la para "vê tudo". (Regressão de segurança.)
  const restrict = Array.isArray(opts?.surveyIds);
  if (restrict && opts!.surveyIds!.length === 0) {
    const answer = await answerFromContext(question, [], opts?.usageCtx);
    return { answer, sources: [] };
  }

  const emb = await generateEmbedding(question, opts?.usageCtx);
  const vec = "[" + emb.join(",") + "]";

  // Inteiro positivo com teto (evita LIMIT enorme → estouro de tokens/custo).
  const k = Number.isInteger(opts?.k) && (opts?.k as number) > 0 ? Math.min(opts!.k as number, 50) : 8;

  const sql = `SELECT a."responseId", a."summary"
FROM "ai_analyses" a
JOIN "responses" r ON r.id = a."responseId" AND r."tenantId" = $1
WHERE a."tenantId" = $1 AND a."embedding" IS NOT NULL${
    restrict ? ` AND r."surveyId" = ANY($3::text[])` : ""
  }
ORDER BY a."embedding" <=> $2::vector ASC
LIMIT ${k}`;

  const params: unknown[] = [tenantId, vec];
  if (restrict) params.push(opts!.surveyIds);

  const rows = await db.$queryRawUnsafe<RagRow[]>(sql, ...params);

  const contexts: RagContext[] = rows
    .filter((r) => r.summary && r.summary.trim().length > 0)
    .map((r) => ({ id: r.responseId, text: (r.summary as string).trim() }));

  const answer = await answerFromContext(question, contexts, opts?.usageCtx);

  // Resposta vazia (Claude sem bloco de texto): fallback SEM fontes (não faz
  // sentido listar fontes que não foram citadas em resposta alguma).
  if (!answer) {
    return {
      answer: "Não foi possível gerar uma resposta com base nos comentários disponíveis.",
      sources: [],
    };
  }

  return {
    answer,
    sources: contexts.map((c) => ({ responseId: c.id, text: c.text })),
  };
}
