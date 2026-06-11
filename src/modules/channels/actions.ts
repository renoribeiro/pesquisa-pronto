"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ChannelType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { enqueueEmail } from "@/server/queues";

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
  baseUrl: z.string().url(),
});

export async function dispatchSurveyByEmail(input: unknown) {
  const { ctx, db } = await requirePermission("survey:create");
  const data = emailDispatchSchema.parse(input);

  const survey = await db.survey.findFirst({
    where: { id: data.surveyId },
    select: { id: true, title: true, slug: true },
  });
  if (!survey) throw new Error("Pesquisa não encontrada.");

  const surveyUrl = `${data.baseUrl}/p/${survey.slug}`;

  // Create or get email distribution
  let dist = await db.distribution.findFirst({
    where: { surveyId: data.surveyId, channel: ChannelType.EMAIL },
  });
  if (!dist) {
    dist = await db.distribution.create({
      data: { tenantId: ctx.tenantId, surveyId: data.surveyId, channel: ChannelType.EMAIL },
    });
  }

  // Create dispatch batch
  const batch = await db.dispatchBatch.create({
    data: {
      tenantId: ctx.tenantId,
      surveyId: data.surveyId,
      channel: ChannelType.EMAIL,
      total: data.recipients.length,
      createdById: ctx.userId,
    },
  });

  // Enqueue one email per recipient
  for (const r of data.recipients) {
    await enqueueEmail({
      to: r.email,
      subject: data.subject,
      html: buildEmailHtml(survey.title, r.name, surveyUrl),
      text: `${r.name ? `Olá ${r.name},\n\n` : ""}Você foi convidado(a) para responder a pesquisa "${survey.title}".\n\nAcesse: ${surveyUrl}\n\nObrigado!`,
    });
  }

  await db.dispatchBatch.update({
    where: { id: batch.id },
    data: { sent: data.recipients.length, status: "SENT" },
  });

  await db.distribution.update({
    where: { id: dist.id },
    data: { sentCount: { increment: data.recipients.length } },
  });

  revalidatePath(`/admin/surveys/${data.surveyId}`);
  return { sent: data.recipients.length };
}

function buildEmailHtml(title: string, name: string | undefined, url: string): string {
  const greeting = name ? `Olá <strong>${name}</strong>,` : "Olá,";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a2e">${title}</h2>
  <p>${greeting}</p>
  <p>Você foi convidado(a) para responder a pesquisa de satisfação <strong>${title}</strong>.</p>
  <p>Sua opinião é muito importante para nós. A pesquisa leva apenas alguns minutos.</p>
  <p style="margin:32px 0">
    <a href="${url}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Responder pesquisa
    </a>
  </p>
  <p style="font-size:12px;color:#666">Ou acesse: <a href="${url}">${url}</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:11px;color:#999">Se não deseja receber mensagens, ignore este email.</p>
</body>
</html>`;
}
