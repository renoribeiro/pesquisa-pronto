import "dotenv/config";
import { Worker, type Job, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { QUEUE_NAMES, type PingJob } from "@/server/queues";
import { processEmail } from "@/workers/processors/email";

/**
 * Processo worker — consome as filas BullMQ.
 * Rode separado do app: `npm run worker` (dev) ou `npm run worker:start` (prod).
 *
 * Conexão Redis própria com `maxRetriesPerRequest: null` (exigência BullMQ).
 * Novos processadores são registrados em PROCESSORS conforme os módulos surgem.
 */

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

async function processSystem(job: Job) {
  if (job.name === "ping") {
    const data = job.data as PingJob;
    console.log(`[worker:system] ping: "${data.message}" (job ${job.id})`);
    return { pong: data.message };
  }
  return null;
}

// Mapa fila → processador. Processadores ainda não implementados são lazy-loaded
// para que o worker suba sem depender de módulos de fases futuras.
const PROCESSORS: Partial<Record<string, Processor>> = {
  [QUEUE_NAMES.system]: processSystem,
  [QUEUE_NAMES.email]: processEmail,
  [QUEUE_NAMES.dispatch]: async (job) =>
    (await import("@/workers/processors/dispatch")).processDispatch(job),
  [QUEUE_NAMES.ai]: async (job) => (await import("@/workers/processors/ai")).processAi(job),
  [QUEUE_NAMES.reports]: async (job) =>
    (await import("@/workers/processors/reports")).processReport(job),
  [QUEUE_NAMES.scheduler]: async (job) =>
    (await import("@/workers/processors/scheduler")).processScheduler(job),
};

const workers: Worker[] = [];

for (const [queueName, processor] of Object.entries(PROCESSORS)) {
  if (!processor) continue;
  const worker = new Worker(queueName, processor, { connection, concurrency: 5 });
  worker.on("failed", (job, err) => {
    console.error(`[worker:${queueName}] job ${job?.id} (${job?.name}) falhou:`, err.message);
  });
  workers.push(worker);
}

console.log("🛠  Worker iniciado. Filas:", Object.values(QUEUE_NAMES).join(", "));

async function shutdown() {
  console.log("\n[worker] encerrando...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
