"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";
import { QUEUE_NAMES, getQueue, type QueueName } from "@/server/queues";
import { getAllQueueMetrics, type QueueMetric } from "@/server/queues/metrics";

/** Job falho serializado para o client (sem objetos BullMQ crus). */
export interface FailedJobView {
  id: string;
  queue: QueueName;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  createdAt: string | null;
  failedAt: string | null;
  data: unknown;
}

export interface JobsOverview {
  metrics: QueueMetric[];
  failed: FailedJobView[];
}

const FAILED_PER_QUEUE = 50;

function assertValidQueue(name: string): asserts name is QueueName {
  if (!(Object.values(QUEUE_NAMES) as string[]).includes(name)) {
    throw new Error("Fila inválida.");
  }
}

/**
 * Visão geral das filas (profundidade) + jobs FALHOS (DLQ) de todas as filas.
 * SUPER_ADMIN apenas: filas BullMQ são globais (cross-tenant).
 */
export async function getJobsOverview(): Promise<JobsOverview> {
  await requireSuperAdmin();

  const metrics = await getAllQueueMetrics();

  const failed: FailedJobView[] = [];
  for (const queue of Object.values(QUEUE_NAMES)) {
    const jobs = await getQueue(queue).getFailed(0, FAILED_PER_QUEUE - 1);
    for (const j of jobs) {
      failed.push({
        id: String(j.id),
        queue,
        name: j.name,
        failedReason: j.failedReason ?? null,
        attemptsMade: j.attemptsMade,
        createdAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
        failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        data: j.data,
      });
    }
  }
  // Mais recentes primeiro.
  failed.sort((a, b) => (b.failedAt ?? "").localeCompare(a.failedAt ?? ""));

  return { metrics, failed };
}

/** Reprocessa um job falho (move de FAILED para a fila de espera). */
export async function retryFailedJob(queue: string, jobId: string): Promise<{ ok: boolean }> {
  const ctx = await requireSuperAdmin();
  assertValidQueue(queue);

  const job = await getQueue(queue).getJob(jobId);
  if (!job) return { ok: false };
  await job.retry();

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "jobs.retry",
    entity: "Job",
    entityId: jobId,
    metadata: { queue, name: job.name },
  });
  revalidatePath("/admin/jobs");
  return { ok: true };
}

/** Remove um job falho da DLQ (descarte definitivo). */
export async function removeFailedJob(queue: string, jobId: string): Promise<{ ok: boolean }> {
  const ctx = await requireSuperAdmin();
  assertValidQueue(queue);

  const job = await getQueue(queue).getJob(jobId);
  if (!job) return { ok: false };
  const name = job.name;
  await job.remove();

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "jobs.remove",
    entity: "Job",
    entityId: jobId,
    metadata: { queue, name },
  });
  revalidatePath("/admin/jobs");
  return { ok: true };
}

/** Reprocessa TODOS os jobs falhos de uma fila. Retorna a quantidade reenviada. */
export async function retryAllFailed(queue: string): Promise<{ retried: number }> {
  const ctx = await requireSuperAdmin();
  assertValidQueue(queue);

  const jobs = await getQueue(queue).getFailed(0, FAILED_PER_QUEUE - 1);
  let retried = 0;
  for (const job of jobs) {
    try {
      await job.retry();
      retried++;
    } catch {
      // job pode ter saído do estado FAILED entre a leitura e o retry — ignora.
    }
  }

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "jobs.retry_all",
    entity: "Queue",
    entityId: queue,
    metadata: { queue, retried },
  });
  revalidatePath("/admin/jobs");
  return { retried };
}
