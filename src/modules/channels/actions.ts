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
      config: { subject: data.subject },
      createdById: ctx.userId,
    },
  });

  // Create recipients, jobs, and enqueue
  for (const r of data.recipients) {
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
  }

  await db.distribution.update({
    where: { id: dist.id },
    data: { sentCount: { increment: data.recipients.length } },
  });

  revalidatePath(`/admin/surveys/${data.surveyId}`);
  return { sent: data.recipients.length };
}
