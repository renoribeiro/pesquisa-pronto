import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Observabilidade de custo de IA.
 *
 * Preços por 1M de tokens (USD) — atualizar conforme a tabela oficial
 * (platform.claude.com/docs/en/pricing e platform.openai.com/pricing).
 * Fonte (jun/2026): Opus $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5,
 * OpenAI text-embedding-3-small ~$0.02 (somente input).
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  opus: { input: 5.0, output: 25.0 },
  sonnet: { input: 3.0, output: 15.0 },
  haiku: { input: 1.0, output: 5.0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

const warnedModels = new Set<string>();

function priceFor(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("opus")) return PRICING_PER_MTOK.opus;
  if (m.includes("sonnet")) return PRICING_PER_MTOK.sonnet;
  if (m.includes("haiku")) return PRICING_PER_MTOK.haiku;
  if (m.includes("embedding-3-large")) return PRICING_PER_MTOK["text-embedding-3-large"];
  if (m.includes("embedding")) return PRICING_PER_MTOK["text-embedding-3-small"];
  // Modelo desconhecido: NÃO subestimar (observabilidade de custo). Usa o preço
  // mais alto conhecido (Opus) como teto e avisa UMA vez por modelo (sem spam).
  if (!warnedModels.has(m)) {
    warnedModels.add(m);
    logger.warn(`estimateCostUsd: preço desconhecido para o modelo "${model}" — usando teto (Opus).`);
  }
  return PRICING_PER_MTOK.opus;
}

/** Estima o custo em USD de uma chamada de IA (arredondado a 6 casas). */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Math.round(cost * 1e6) / 1e6;
}

export interface AiUsageCtx {
  tenantId: string;
  jobType: string; // sentiment | embedding | summary | topics | rag | suggestion | entities
}

/**
 * Registra o uso de IA (tokens + custo estimado) por tenant/job.
 * Best-effort: usa o client base (telemetria de sistema com tenantId explícito,
 * mesmo padrão de audit.ts) e nunca lança — falhas só são logadas.
 */
export async function recordAiUsage(
  ctx: AiUsageCtx,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  if (!ctx.tenantId) {
    logger.warn("recordAiUsage: tenantId vazio — telemetria de IA ignorada.");
    return;
  }
  try {
    await prisma.aIUsageLog.create({
      data: {
        tenantId: ctx.tenantId,
        jobType: ctx.jobType,
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      },
    });
  } catch (err) {
    logger.error("recordAiUsage: falha ao gravar AIUsageLog", err);
  }
}
