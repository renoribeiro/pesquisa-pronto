"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ChannelType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { enqueueDispatch } from "@/server/queues";
import { generateToken } from "@/lib/tokens";

export async function getOrCreateLinkDistribution(surveyId: string) {
  const { ctx, db } = await requirePermission("survey:create");

  const existing = await db.distribution.findFirst({
    where: { surveyId, channel: ChannelType.LINK },
  });
  if (existing) return existing;

  const dist = await db.distribution.create({
    data: {
      tenantId: ctx.tenantId,
      surveyId,
      channel: ChannelType.LINK,
    },
  });
  revalidatePath(`/admin/surveys/${surveyId}`);
  return dist;
}

const emailDispatchSchema = z.object({
  surveyId: z.string(),
  subject: z.string().min(1),
  recipients: z.array(
    z.object({
      name: z.string().optional(),
      email: z.string().email(),
    }),
  ).min(1),
  // baseUrl não é usado pelo servidor (a URL pública é derivada de env.APP_URL no
  // worker). Aceito como opcional por compatibilidade com clientes que ainda o
  // enviam, mas é ignorado.
  baseUrl: z.string().url().optional(),
});

export async function dispatchSurveyByEmail(input: unknown) {
  const { ctx, db } = await requirePermission("survey:create");
  const data = emailDispatchSchema.parse(input);

  const survey = await db.survey.findFirst({
    where: { id: data.surveyId },
    select: { id: true, title: true, slug: true },
  });
  if (!survey) throw new Error("Pesquisa não encontrada.");

  // Create or get email distribution
  let dist = await db.distribution.findFirst({
    where: { surveyId: data.surveyId, channel: ChannelType.EMAIL },
  });
  if (!dist) {
    dist = await db.distribution.create({
      data: { tenantId: ctx.tenantId, surveyId: data.surveyId, channel: ChannelType.EMAIL },
    });
  }

  // Deduplica destinatários por (survey, email) — o mesmo e-mail informado mais
  // de uma vez deve gerar um único disparo. Mantém a primeira ocorrência (e seu
  // nome). Normaliza o e-mail por lowercase para a chave de deduplicação.
  const uniqueRecipients = new Map<string, { name?: string; email: string }>();
  for (const r of data.recipients) {
    const key = r.email.trim().toLowerCase();
    if (!uniqueRecipients.has(key)) {
      uniqueRecipients.set(key, { name: r.name, email: r.email.trim() });
    }
  }
  const recipients = [...uniqueRecipients.values()];

  // Create dispatch batch
  const batch = await db.dispatchBatch.create({
    data: {
      tenantId: ctx.tenantId,
      surveyId: data.surveyId,
      channel: ChannelType.EMAIL,
      total: recipients.length,
      config: { subject: data.subject },
      createdById: ctx.userId,
    },
  });

  // Create recipients, jobs, and enqueue. Isola erro por destinatário: um
  // endereço inválido/falha de enfileiramento não deve abortar o lote inteiro.
  let enqueued = 0;
  const failures: { email: string; error: string }[] = [];

  for (const r of recipients) {
    try {
      const token = generateToken();
      const recipient = await db.recipient.create({
        data: {
          tenantId: ctx.tenantId,
          surveyId: data.surveyId,
          name: r.name ?? null,
          email: r.email,
          token,
        },
      });

      const job = await db.dispatchJob.create({
        data: {
          tenantId: ctx.tenantId,
          batchId: batch.id,
          recipientId: recipient.id,
          channel: ChannelType.EMAIL,
          status: "PENDING",
        },
      });

      await enqueueDispatch({
        dispatchJobId: job.id,
        tenantId: ctx.tenantId,
      });
      enqueued += 1;
    } catch (err) {
      failures.push({
        email: r.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Contabiliza apenas os jobs efetivamente enfileirados (não a contagem bruta
  // de entrada). O envio real é confirmado pelo worker; aqui refletimos o que
  // entrou na fila de disparo.
  if (enqueued > 0) {
    await db.distribution.update({
      where: { id: dist.id },
      data: { sentCount: { increment: enqueued } },
    });
  }

  revalidatePath(`/admin/surveys/${data.surveyId}`);
  return { sent: enqueued, total: recipients.length, failures };
}
