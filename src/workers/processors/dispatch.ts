import type { Job } from "bullmq";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getWhatsAppProvider } from "@/lib/channels/whatsapp";
import { getSmsProvider } from "@/lib/channels/sms";
import { enqueueEmail } from "@/server/queues";
import type { DispatchJobPayload } from "@/server/queues";
import { escapeHtml, safeHref } from "@/lib/html";

export async function processDispatch(job: Job): Promise<unknown> {
  if (job.name !== "send") return null;
  return sendDispatchJob(job.data as DispatchJobPayload, job);
}

/** Subconjunto mínimo de Job que precisamos para decidir tentativa final. */
type JobAttemptInfo = { attemptsMade: number; opts: { attempts?: number } };

async function sendDispatchJob(
  { dispatchJobId, tenantId }: DispatchJobPayload,
  job: JobAttemptInfo,
) {
  const dispatchJob = await prisma.dispatchJob.findFirst({
    where: { id: dispatchJobId, tenantId },
    include: {
      batch: { include: { survey: { select: { title: true, slug: true } } } },
      recipient: true,
    },
  });

  if (!dispatchJob) {
    console.warn(`[worker:dispatch] job ${dispatchJobId} não encontrado`);
    return null;
  }

  // Permite reprocessar jobs que ficaram em estados não-terminais (PENDING),
  // que estavam em voo (SENDING — provável crash/retry) ou que falharam (FAILED).
  // Jobs já SENT/terminais não são reprocessados (idempotência).
  const RETRIABLE_STATUSES = ["PENDING", "SENDING", "FAILED"] as const;
  if (!RETRIABLE_STATUSES.includes(dispatchJob.status as (typeof RETRIABLE_STATUSES)[number])) {
    console.log(`[worker:dispatch] job ${dispatchJobId} já processado: ${dispatchJob.status}`);
    return null;
  }

  await prisma.dispatchJob.update({
    where: { id: dispatchJobId },
    data: { status: "SENDING" },
  });

  const survey = dispatchJob.batch.survey;
  const recipient = dispatchJob.recipient;
  const surveyUrl = `${env.APP_URL}/p/${survey.slug}${recipient?.token ? `?t=${recipient.token}` : ""}`;

  try {
    let result: { success: boolean; messageId?: string; error?: string } = { success: false };

    switch (dispatchJob.channel) {
      case "EMAIL": {
        const to = recipient?.email;
        if (!to) throw new Error("Destinatário sem email.");
        const batchConfig = (dispatchJob.batch.config as Record<string, unknown>) ?? {};
        const subject = String(batchConfig.subject ?? `Pesquisa de satisfação — ${survey.title}`);
        await enqueueEmail({
          to,
          subject,
          html: buildEmailHtml(survey.title, recipient?.name ?? undefined, surveyUrl),
          text: `Olá${recipient?.name ? ` ${recipient.name}` : ""}! Responda nossa pesquisa: ${surveyUrl}`,
        });
        result = { success: true, messageId: `email_queued` };
        break;
      }

      case "WHATSAPP": {
        const to = recipient?.phone;
        if (!to) throw new Error("Destinatário sem telefone.");
        const provider = getWhatsAppProvider();
        result = await provider.send({
          to,
          templateName: env.WHATSAPP_SURVEY_TEMPLATE,
          variables: {
            "1": recipient?.name ?? "paciente",
            "2": surveyUrl,
          },
        });
        break;
      }

      case "SMS": {
        const to = recipient?.phone;
        if (!to) throw new Error("Destinatário sem telefone.");
        const provider = getSmsProvider();
        result = await provider.send({
          to,
          body: `${survey.title}: ${surveyUrl}`,
        });
        break;
      }

      default:
        throw new Error(`Canal não suportado: ${dispatchJob.channel}`);
    }

    if (!result.success) throw new Error(result.error ?? "Erro desconhecido");

    await prisma.dispatchJob.update({
      where: { id: dispatchJobId },
      data: { status: "SENT", sentAt: new Date() },
    });
    await prisma.dispatchBatch.update({
      where: { id: dispatchJob.batchId },
      data: { sent: { increment: 1 } },
    });

    console.log(`[worker:dispatch] job ${dispatchJobId} enviado`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

    if (isFinalAttempt) {
      // Última tentativa: marca como FAILED e contabiliza no lote uma única vez.
      await prisma.dispatchJob.update({
        where: { id: dispatchJobId },
        data: { status: "FAILED", error },
      });
      await prisma.dispatchBatch.update({
        where: { id: dispatchJob.batchId },
        data: { failed: { increment: 1 } },
      });
    } else {
      // Tentativas intermediárias: deixa PENDING para reprocessar; registra o
      // último erro mas NÃO incrementa batch.failed (evita contagem inflada).
      await prisma.dispatchJob.update({
        where: { id: dispatchJobId },
        data: { status: "PENDING", error },
      });
    }
    throw err;
  }
}

function buildEmailHtml(title: string, name: string | undefined, url: string): string {
  // Dados controlados pelo usuário (title/name) e a URL precisam ser escapados
  // para evitar injeção de HTML / phishing no corpo do e-mail.
  const safeTitle = escapeHtml(title);
  const greeting = name ? `Olá <strong>${escapeHtml(name)}</strong>,` : "Olá,";
  const href = safeHref(url);
  const safeUrlText = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a2e">${safeTitle}</h2>
  <p>${greeting}</p>
  <p>Convidamos você a responder nossa pesquisa de satisfação. Leva apenas alguns minutos.</p>
  <p style="margin:32px 0">
    <a href="${href}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Responder pesquisa
    </a>
  </p>
  <p style="font-size:12px;color:#666">Ou acesse: <a href="${href}">${safeUrlText}</a></p>
</body>
</html>`;
}
