import type { Job } from "bullmq";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getWhatsAppProvider } from "@/lib/channels/whatsapp";
import { getSmsProvider } from "@/lib/channels/sms";
import { enqueueEmail } from "@/server/queues";
import type { DispatchJobPayload } from "@/server/queues";

export async function processDispatch(job: Job): Promise<unknown> {
  if (job.name !== "send") return null;
  return sendDispatchJob(job.data as DispatchJobPayload);
}

async function sendDispatchJob({ dispatchJobId, tenantId }: DispatchJobPayload) {
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

  if (dispatchJob.status !== "PENDING") {
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
    await prisma.dispatchJob.update({
      where: { id: dispatchJobId },
      data: { status: "FAILED", error },
    });
    await prisma.dispatchBatch.update({
      where: { id: dispatchJob.batchId },
      data: { failed: { increment: 1 } },
    });
    throw err;
  }
}

function buildEmailHtml(title: string, name: string | undefined, url: string): string {
  const greeting = name ? `Olá <strong>${name}</strong>,` : "Olá,";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a2e">${title}</h2>
  <p>${greeting}</p>
  <p>Convidamos você a responder nossa pesquisa de satisfação. Leva apenas alguns minutos.</p>
  <p style="margin:32px 0">
    <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Responder pesquisa
    </a>
  </p>
  <p style="font-size:12px;color:#666">Ou acesse: <a href="${url}">${url}</a></p>
</body>
</html>`;
}
