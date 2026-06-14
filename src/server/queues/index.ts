import { Queue, type JobsOptions } from "bullmq";
import { redis } from "@/lib/redis";

/**
 * Definição central das filas BullMQ e dos enqueuers tipados.
 *
 * Filas:
 *  - system   : jobs de fumaça/manutenção
 *  - email     : envio de email transacional/relatórios
 *  - dispatch  : disparo de pesquisas (email/sms/whatsapp) em lote
 *  - ai        : análise de IA (sentimento, temas, resumos)
 *  - reports   : geração de relatórios (PDF/Excel)
 *  - scheduler : tarefas agendadas (resumos, relatórios recorrentes, retenção)
 */

export const QUEUE_NAMES = {
  system: "system",
  email: "email",
  dispatch: "dispatch",
  ai: "ai",
  reports: "reports",
  scheduler: "scheduler",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

// Singleton das filas (evita múltiplas instâncias em hot-reload)
const globalForQueues = globalThis as unknown as { queues?: Record<string, Queue> };
const queues = globalForQueues.queues ?? {};
if (process.env.NODE_ENV !== "production") globalForQueues.queues = queues;

/**
 * Obtém (criando sob demanda) a fila. A criação é preguiçosa para que o simples
 * import deste módulo não abra conexão Redis — importante durante o build do
 * Next.js e a análise estática de rotas.
 */
export function getQueue(name: QueueName): Queue {
  queues[name] ??= new Queue(name, { connection: redis, defaultJobOptions });
  return queues[name];
}

// ── Payloads tipados ──────────────────────────────────────────
export type PingJob = { message: string };

export type SendEmailJob = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type DispatchJobPayload = {
  dispatchJobId: string;
  tenantId: string;
};

export type AnalyzeResponseJob = {
  tenantId: string;
  responseId: string;
};

export type GenerateSummaryJob = {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy?: "auto" | "manual";
};

export type GenerateReportJob = {
  tenantId: string;
  reportId: string;
};

export type ExtractTopicsJob = {
  tenantId: string;
  surveyId?: string;
  periodStart: string;
  periodEnd: string;
};

// ── Enqueuers ─────────────────────────────────────────────────
export function enqueuePing(message: string) {
  return getQueue(QUEUE_NAMES.system).add("ping", { message } satisfies PingJob);
}

export function enqueueEmail(payload: SendEmailJob, opts?: { jobId?: string }) {
  // jobId determinístico => BullMQ deduplica enfileiramentos idênticos (entregas
  // duplicadas de webhook produzem o MESMO job, nunca dois e-mails).
  return getQueue(QUEUE_NAMES.email).add("send", payload, opts);
}

export function enqueueDispatch(payload: DispatchJobPayload) {
  return getQueue(QUEUE_NAMES.dispatch).add("send", payload);
}

export function enqueueAnalyzeResponse(payload: AnalyzeResponseJob) {
  return getQueue(QUEUE_NAMES.ai).add("analyze-response", payload);
}

export function enqueueExtractTopics(payload: ExtractTopicsJob) {
  return getQueue(QUEUE_NAMES.ai).add("extract-topics", payload);
}

export function enqueueGenerateSummary(payload: GenerateSummaryJob) {
  return getQueue(QUEUE_NAMES.ai).add("generate-summary", payload);
}

export function enqueueGenerateReport(payload: GenerateReportJob) {
  return getQueue(QUEUE_NAMES.reports).add("generate", payload);
}
