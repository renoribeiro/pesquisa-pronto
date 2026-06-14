import "dotenv/config";
import { Worker, type Job, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { QUEUE_NAMES, getQueue, type PingJob } from "@/server/queues";
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
  // Scheduler roda serialmente (concurrency 1): a checagem de tendência faz
  // read-then-create de alertas; execução concorrente poderia duplicar.
  const concurrency = queueName === QUEUE_NAMES.scheduler ? 1 : 5;
  const worker = new Worker(queueName, processor, { connection, concurrency });
  worker.on("failed", (job, err) => {
    console.error(`[worker:${queueName}] job ${job?.id} (${job?.name}) falhou:`, err.message);
  });
  workers.push(worker);
}

console.log("🛠  Worker iniciado. Filas:", Object.values(QUEUE_NAMES).join(", "));

// Agenda os jobs periódicos do scheduler. O dedupe de repeatable do BullMQ é
// pela repeat-key (nome + opções), NÃO pelo jobId — então, se o intervalo mudar
// num deploy futuro, o repeatable antigo ficaria órfão. Removemos os existentes
// (por nome) antes de re-adicionar, garantindo um único de cada ativo.
const schedulerQueue = getQueue(QUEUE_NAMES.scheduler);
const REPEATABLES: { name: string; every: number; label: string }[] = [
  { name: "trend-check", every: 60 * 60 * 1000, label: "1h" }, // tendência negativa de NPS
  { name: "retention", every: 24 * 60 * 60 * 1000, label: "24h" }, // anonimização LGPD
];
schedulerQueue
  .getRepeatableJobs()
  .then((jobs) =>
    Promise.all(
      jobs
        .filter((j) => REPEATABLES.some((r) => r.name === j.name))
        .map((j) => schedulerQueue.removeRepeatableByKey(j.key)),
    ),
  )
  .then(() =>
    Promise.all(REPEATABLES.map((r) => schedulerQueue.add(r.name, {}, { repeat: { every: r.every } }))),
  )
  .then(() =>
    console.log(
      "[worker:scheduler] agendados:",
      REPEATABLES.map((r) => `${r.name} (${r.label})`).join(", "),
    ),
  )
  .catch((e) => console.error("[worker:scheduler] falha ao agendar repeatables:", e));

async function shutdown() {
  console.log("\n[worker] encerrando...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
