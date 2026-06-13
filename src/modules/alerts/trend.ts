import type { TenantClient } from "@/lib/tenant";
import { redis } from "@/lib/redis";

/**
 * Detecção de tendência negativa de NPS (AlertType.NEGATIVE_TREND).
 *
 * Compara o NPS dos últimos 7 dias com os 7 dias anteriores e dispara um
 * alerta quando há queda relevante.
 */

const MIN_RESPONSES_PER_WINDOW = 5;
const DEFAULT_MIN_DROP = 10;

export interface TrendOptions {
  /** Queda mínima de pontos de NPS para considerar a tendência negativa. */
  minDrop?: number;
}

export interface TrendResult {
  isNegative: boolean;
  drop: number;
}

/**
 * Função pura: avalia se a variação de NPS configura tendência negativa.
 * `drop` é a queda em pontos (previousNps - currentNps). A tendência é
 * negativa quando `drop >= (opts.minDrop ?? 10)`.
 */
export function detectNegativeTrend(
  currentNps: number,
  previousNps: number,
  opts?: TrendOptions,
): TrendResult {
  const minDrop = opts?.minDrop ?? DEFAULT_MIN_DROP;
  const drop = previousNps - currentNps;
  return { isNegative: drop >= minDrop, drop };
}

interface NpsWindow {
  nps: number;
  total: number;
}

/**
 * Calcula o NPS das respostas concluídas e com nota dentro do intervalo
 * [from, to). Retorna o NPS arredondado e o total de respostas.
 */
async function npsForWindow(
  db: TenantClient,
  from: Date,
  to: Date,
): Promise<NpsWindow> {
  const responses = await db.response.findMany({
    where: {
      completed: true,
      npsScore: { not: null },
      createdAt: { gte: from, lt: to },
    },
    select: { npsScore: true },
  });

  const total = responses.length;
  if (total === 0) return { nps: 0, total: 0 };

  let promoters = 0;
  let detractors = 0;
  for (const r of responses) {
    const score = r.npsScore as number;
    if (score >= 9) promoters += 1;
    else if (score <= 6) detractors += 1;
  }

  const nps = Math.round(((promoters - detractors) / total) * 100);
  return { nps, total };
}

/**
 * Verifica tendência negativa de NPS para um tenant e, se for o caso,
 * cria um Alert NEGATIVE_TREND (com dedupe nas últimas 24h).
 *
 * @returns número de alertas criados (0 ou 1).
 */
export async function checkTrendAlerts(
  db: TenantClient,
  tenantId: string,
): Promise<number> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const currentTo = new Date(now);
  const currentFrom = new Date(now - 7 * day);
  const previousTo = currentFrom;
  const previousFrom = new Date(now - 14 * day);

  const [current, previous] = await Promise.all([
    npsForWindow(db, currentFrom, currentTo),
    npsForWindow(db, previousFrom, previousTo),
  ]);

  // Exige amostra mínima em ambas as janelas.
  if (
    current.total < MIN_RESPONSES_PER_WINDOW ||
    previous.total < MIN_RESPONSES_PER_WINDOW
  ) {
    return 0;
  }

  // Lê o threshold configurado para o tenant (se houver).
  const threshold = await db.alertThreshold.findFirst({
    where: { type: "NEGATIVE_TREND", active: true },
  });

  let minDrop: number | undefined;
  const config = threshold?.config;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const raw = (config as Record<string, unknown>).minDrop;
    // Exige positivo: minDrop <= 0 dispararia alerta mesmo com NPS estável/melhor.
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      minDrop = raw;
    }
  }

  const { isNegative, drop } = detectNegativeTrend(current.nps, previous.nps, {
    minDrop,
  });

  if (!isNegative) return 0;

  // Lock CURTO (robusto a múltiplas réplicas) só para serializar a seção crítica
  // read-then-create. A janela de dedupe de 24h é garantida pelo findFirst no
  // banco — NÃO pelo TTL do lock — para que uma falha transitória não bloqueie
  // alertas por 24h. O lock é sempre liberado (finally).
  const lockKey = `lock:trend:${tenantId}`;
  const acquired = await redis.set(lockKey, "1", "EX", 30, "NX");
  if (acquired !== "OK") return 0;

  try {
    // Dedupe por tipo + janela de 24h, INDEPENDENTE do status: reconhecer/resolver
    // um alerta dentro da janela não deve reabrir a torneira de novos alertas.
    const since = new Date(now - day);
    const existing = await db.alert.findFirst({
      where: { type: "NEGATIVE_TREND", createdAt: { gte: since } },
    });
    if (existing) return 0;

    await db.alert.create({
      data: {
        tenantId,
        type: "NEGATIVE_TREND",
        status: "OPEN",
        title: "Tendência negativa de NPS",
        message: `O NPS caiu ${drop} ponto${drop === 1 ? "" : "s"} na última semana (de ${previous.nps} para ${current.nps}).`,
        metadata: { currentNps: current.nps, previousNps: previous.nps, drop },
      },
    });
    return 1;
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}
