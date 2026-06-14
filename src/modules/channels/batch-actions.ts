"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ChannelType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { enqueueDispatch } from "@/server/queues";
import { generateToken } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import {
  parseRecipientsBuffer,
  isValidEmail,
  normalizePhone,
  MAX_ROWS,
  type ParsedRecipients,
} from "@/lib/recipients";

// Canais suportados para disparo em lote (LINK/QR/EMBED não disparam para
// destinatários individuais). O worker de dispatch entende exatamente estes.
const BATCH_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"] as const;
type BatchChannel = (typeof BATCH_CHANNELS)[number];

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Parsing de arquivo (CSV / Excel) ──────────────────────────

/**
 * Lê um arquivo CSV ou Excel e retorna cabeçalho + linhas como matriz de strings.
 * O mapeamento de colunas e a validação são feitos no cliente (preview) e
 * reconfirmados em `dispatchSurveyBatch`. A lógica pura de parsing vive em
 * `@/lib/recipients` (testável sem auth/I/O).
 */
export async function parseRecipientsFile(formData: FormData): Promise<ParsedRecipients> {
  await requirePermission("survey:create");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Arquivo ausente.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo muito grande (máx. 5 MB).");

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseRecipientsBuffer(buffer, ext);
}

// ── Disparo do lote ───────────────────────────────────────────

const recipientSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  sector: z.string().trim().optional(),
});

const batchSchema = z.object({
  surveyId: z.string().min(1),
  channel: z.enum(BATCH_CHANNELS),
  subject: z.string().trim().optional(),
  // ISO 8601; opcional. Se ausente/passado, dispara imediatamente.
  scheduledAt: z.string().datetime().optional().nullable(),
  recipients: z.array(recipientSchema).min(1).max(MAX_ROWS),
});

export type DispatchBatchResult = {
  batchId: string;
  enqueued: number;
  total: number;
  skipped: number;
  scheduledAt: string | null;
  failures: { row: number; value: string; error: string }[];
};

/**
 * Cria um lote de disparo (DispatchBatch) para os destinatários informados e
 * enfileira um job por destinatário. Generaliza `dispatchSurveyByEmail` para
 * EMAIL/WhatsApp/SMS, com dedupe, agendamento e isolamento de erro por linha.
 */
export async function dispatchSurveyBatch(input: unknown): Promise<DispatchBatchResult> {
  const { ctx, db } = await requirePermission("survey:create");
  const data = batchSchema.parse(input);
  const channel = data.channel as BatchChannel;

  const survey = await db.survey.findFirst({
    where: { id: data.surveyId },
    select: { id: true, title: true, slug: true },
  });
  if (!survey) throw new Error("Pesquisa não encontrada.");

  if (channel === "EMAIL" && !data.subject) {
    throw new Error("Informe o assunto do e-mail.");
  }

  // Agendamento: delay em ms até scheduledAt (0 se ausente/passado).
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

  // Valida + dedup. Chave: e-mail (lowercase) para EMAIL; telefone normalizado
  // para WhatsApp/SMS. Mantém a primeira ocorrência.
  const failures: DispatchBatchResult["failures"] = [];
  const unique = new Map<string, { name?: string; email?: string; phone?: string; sector?: string }>();

  data.recipients.forEach((r, idx) => {
    const rowNum = idx + 1;
    if (channel === "EMAIL") {
      const email = (r.email ?? "").trim();
      if (!isValidEmail(email)) {
        failures.push({ row: rowNum, value: email || "(vazio)", error: "E-mail inválido" });
        return;
      }
      const key = email.toLowerCase();
      if (!unique.has(key)) unique.set(key, { name: r.name, email, sector: r.sector });
    } else {
      const phone = normalizePhone(r.phone ?? "");
      if (!phone) {
        failures.push({ row: rowNum, value: (r.phone ?? "").trim() || "(vazio)", error: "Telefone inválido" });
        return;
      }
      if (!unique.has(phone)) unique.set(phone, { name: r.name, phone, sector: r.sector });
    }
  });

  const recipients = [...unique.values()];
  if (recipients.length === 0) {
    throw new Error("Nenhum destinatário válido após validação.");
  }

  const skipped = data.recipients.length - recipients.length;

  const batch = await db.dispatchBatch.create({
    data: {
      tenantId: ctx.tenantId,
      surveyId: data.surveyId,
      channel: ChannelType[channel],
      total: recipients.length,
      scheduledAt,
      config: channel === "EMAIL" ? { subject: data.subject } : {},
      createdById: ctx.userId,
    },
  });

  // Cria recipient + job e enfileira. Isola erro por destinatário: uma falha de
  // criação/enfileiramento não aborta o lote inteiro.
  let enqueued = 0;
  let failedJobs = 0;
  for (const [idx, r] of recipients.entries()) {
    let jobId: string | null = null;
    try {
      const token = generateToken();
      const recipient = await db.recipient.create({
        data: {
          tenantId: ctx.tenantId,
          surveyId: data.surveyId,
          name: r.name ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
          sector: r.sector ?? null,
          token,
        },
      });

      const job = await db.dispatchJob.create({
        data: {
          tenantId: ctx.tenantId,
          batchId: batch.id,
          recipientId: recipient.id,
          channel: ChannelType[channel],
          status: "PENDING",
        },
      });
      jobId = job.id;

      await enqueueDispatch({ dispatchJobId: job.id, tenantId: ctx.tenantId }, delay ? { delay } : undefined);
      enqueued += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failures.push({ row: idx + 1, value: r.email ?? r.phone ?? "(?)", error });
      // Se o DispatchJob chegou a ser criado mas o enfileiramento falhou, marca-o
      // FAILED (e contabiliza no lote) para não ficar um job PENDING órfão que
      // nenhum worker processará — assim total = sent + failed + pendentes na fila.
      if (jobId) {
        await db.dispatchJob
          .update({ where: { id: jobId }, data: { status: "FAILED", error } })
          .catch(() => {});
        failedJobs += 1;
      }
    }
  }

  if (failedJobs > 0) {
    await db.dispatchBatch
      .update({ where: { id: batch.id }, data: { failed: { increment: failedJobs } } })
      .catch(() => {});
  }

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "dispatch.batch_created",
    metadata: { surveyId: data.surveyId, channel, total: recipients.length, enqueued, scheduledAt: scheduledAt?.toISOString() ?? null },
  });

  revalidatePath(`/admin/surveys/${data.surveyId}`);
  return {
    batchId: batch.id,
    enqueued,
    total: recipients.length,
    skipped,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    failures,
  };
}

// ── Relatório de lotes ────────────────────────────────────────

export type BatchReportItem = {
  id: string;
  channel: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  scheduledAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

export async function listDispatchBatches(surveyId: string): Promise<BatchReportItem[]> {
  const { db } = await requirePermission("survey:create");
  const batches = await db.dispatchBatch.findMany({
    where: { surveyId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    channel: b.channel,
    status: b.status,
    total: b.total,
    sent: b.sent,
    failed: b.failed,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    createdBy: b.createdBy?.name ?? null,
  }));
}
