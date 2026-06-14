/**
 * Funções PURAS de avaliação de alertas (sem I/O, Redis ou env). Isoladas para
 * serem testáveis sem carregar a stack de infraestrutura — `trend.ts` (que
 * importa Redis) as reutiliza nas varreduras com efeito colateral.
 */

export const DEFAULT_MIN_DROP = 10;
export const DEFAULT_MIN_PER_WEEK = 5;

export interface TrendOptions {
  /** Queda mínima de pontos de NPS para considerar a tendência negativa. */
  minDrop?: number;
}

export interface TrendResult {
  isNegative: boolean;
  drop: number;
}

/**
 * Avalia se a variação de NPS configura tendência negativa. `drop` é a queda em
 * pontos (previousNps - currentNps); negativa quando `drop >= (minDrop ?? 10)`.
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

/**
 * Avalia se o volume da semana atual configura "volume baixo". Exige atividade
 * no período anterior (`previousCount > 0`) para não disparar perpetuamente em
 * tenants sem coleta; alerta quando a semana atual cai abaixo do mínimo.
 */
export function isLowVolume(
  currentCount: number,
  previousCount: number,
  minPerWeek = DEFAULT_MIN_PER_WEEK,
): boolean {
  return previousCount > 0 && currentCount < minPerWeek;
}
