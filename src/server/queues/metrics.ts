import { QUEUE_NAMES, getQueue, type QueueName } from "./index";

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueMetric {
  name: QueueName;
  counts: QueueCounts;
}

/**
 * Coleta a profundidade (job counts) de uma fila. Útil para health-checks e
 * para o painel de jobs / DLQ.
 */
export async function getQueueCounts(name: QueueName): Promise<QueueCounts> {
  const counts = await getQueue(name).getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused",
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  };
}

/** Profundidade de todas as filas conhecidas. */
export async function getAllQueueMetrics(): Promise<QueueMetric[]> {
  const names = Object.values(QUEUE_NAMES);
  return Promise.all(
    names.map(async (name) => ({ name, counts: await getQueueCounts(name) })),
  );
}

/**
 * Agrega sinais de saúde das filas: total de jobs falhos e de backlog (waiting).
 * Limiares default conservadores; ajuste conforme o volume de produção.
 */
export function summarizeQueueHealth(
  metrics: QueueMetric[],
  thresholds: { maxFailed?: number; maxBacklog?: number } = {},
): { healthy: boolean; totalFailed: number; totalBacklog: number } {
  const maxFailed = thresholds.maxFailed ?? 100;
  const maxBacklog = thresholds.maxBacklog ?? 5000;
  const totalFailed = metrics.reduce((s, m) => s + m.counts.failed, 0);
  const totalBacklog = metrics.reduce((s, m) => s + m.counts.waiting, 0);
  return {
    healthy: totalFailed <= maxFailed && totalBacklog <= maxBacklog,
    totalFailed,
    totalBacklog,
  };
}
