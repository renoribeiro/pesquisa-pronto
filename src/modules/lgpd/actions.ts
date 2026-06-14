"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { anonymizeExpiredResponses } from "./retention";

// Normaliza para minúsculas (consistente com o login) e casa case-insensitive.
const emailSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
});

export interface PatientExport {
  email: string;
  exportedAt: string;
  recipients: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    sector: string | null;
    surveyId: string;
    attendedAt: string | null;
    optedOut: boolean;
    createdAt: string;
    responses: Array<{
      id: string;
      surveyId: string;
      channel: string;
      npsScore: number | null;
      completed: boolean;
      anonymous: boolean;
      consentAt: string | null;
      createdAt: string;
      answers: Array<{
        questionId: string;
        value: unknown;
        createdAt: string;
      }>;
    }>;
  }>;
}

/**
 * Direito de acesso/portabilidade (LGPD): exporta todos os dados do titular
 * identificado por e-mail, dentro do tenant atual.
 */
export async function exportPatientData(email: string): Promise<PatientExport> {
  const { ctx, db } = await requirePermission("system:configure");
  const { email: parsedEmail } = emailSchema.parse({ email });

  const recipients = await db.recipient.findMany({
    where: { email: { equals: parsedEmail, mode: "insensitive" } },
    include: {
      responses: {
        include: {
          answers: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result: PatientExport = {
    email: parsedEmail,
    exportedAt: new Date().toISOString(),
    recipients: recipients.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      sector: r.sector,
      surveyId: r.surveyId,
      attendedAt: r.attendedAt ? r.attendedAt.toISOString() : null,
      optedOut: r.optedOut,
      createdAt: r.createdAt.toISOString(),
      responses: r.responses.map((resp) => ({
        id: resp.id,
        surveyId: resp.surveyId,
        channel: resp.channel,
        npsScore: resp.npsScore,
        completed: resp.completed,
        anonymous: resp.anonymous,
        consentAt: resp.consentAt ? resp.consentAt.toISOString() : null,
        createdAt: resp.createdAt.toISOString(),
        answers: resp.answers.map((a) => ({
          questionId: a.questionId,
          value: a.value,
          createdAt: a.createdAt.toISOString(),
        })),
      })),
    })),
  };

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "lgpd.patient_exported",
    metadata: { email: parsedEmail, recipients: recipients.length },
  });

  return result;
}

/**
 * Direito de exclusão/eliminação (LGPD): desvincula e anonimiza as Responses do
 * titular e remove os Recipients identificados pelo e-mail, dentro do tenant.
 * As Responses são preservadas como anônimas (dado agregado), apenas perdendo o
 * vínculo com o titular.
 */
export async function deletePatientData(email: string): Promise<{ recipients: number; responses: number }> {
  const { ctx, db } = await requirePermission("system:configure");
  const { email: parsedEmail } = emailSchema.parse({ email });

  const recipients = await db.recipient.findMany({
    where: { email: { equals: parsedEmail, mode: "insensitive" } },
    select: { id: true },
  });

  if (recipients.length === 0) {
    await audit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "lgpd.patient_deleted",
      metadata: { email: parsedEmail, recipients: 0, responses: 0 },
    });
    return { recipients: 0, responses: 0 };
  }

  const recipientIds = recipients.map((r) => r.id);
  const responses = await db.response.findMany({
    where: { recipientId: { in: recipientIds } },
    select: { id: true },
  });
  const responseIds = responses.map((r) => r.id);

  // Tudo numa transação: exclusão parcial não deve deixar dados inconsistentes.
  const { responsesCount, recipientsCount } = await db.$transaction(async (tx) => {
    if (responseIds.length > 0) {
      // 1) Limpa PII derivada nas análises de IA: resumo/emoções/entidades E o
      //    embedding (vetor é representação reversível-por-similaridade do texto
      //    livre do paciente — coluna Unsupported, exige raw SQL escopado).
      await tx.aIAnalysis.updateMany({
        where: { responseId: { in: responseIds } },
        data: { summary: null, emotions: Prisma.DbNull, entities: Prisma.DbNull },
      });
      await tx.$executeRawUnsafe(
        'UPDATE "ai_analyses" SET "embedding" = NULL WHERE "responseId" = ANY($1::text[]) AND "tenantId" = $2',
        responseIds,
        ctx.tenantId,
      );
      // 2) Direito de eliminação: apaga o conteúdo das respostas (texto livre é
      //    PII direta). O npsScore agregado é mantido na Response.
      await tx.answer.deleteMany({ where: { responseId: { in: responseIds } } });
    }
    // 3) Anonimiza/desvincula as Responses do titular (preserva NPS agregado).
    const updated = await tx.response.updateMany({
      where: { recipientId: { in: recipientIds } },
      data: { ipHash: null, recipientId: null, anonymous: true, anonymizedAt: new Date() },
    });
    // 4) Remove os Recipients (DispatchJob.recipientId tem onDelete: SetNull).
    const deleted = await tx.recipient.deleteMany({ where: { id: { in: recipientIds } } });
    return { responsesCount: updated.count, recipientsCount: deleted.count };
  });

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "lgpd.patient_deleted",
    metadata: { email: parsedEmail, recipients: recipientsCount, responses: responsesCount },
  });

  revalidatePath("/admin/lgpd");
  return { recipients: recipientsCount, responses: responsesCount };
}

/**
 * Executa a rotina de retenção/anonimização imediatamente para o tenant atual,
 * usando `tenant.retentionMonths` (default 24).
 */
export async function runRetentionNow(): Promise<{ count: number; retentionMonths: number }> {
  const { ctx, db } = await requirePermission("system:configure");

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { retentionMonths: true },
  });
  const retentionMonths = tenant?.retentionMonths ?? 24;

  const count = await anonymizeExpiredResponses(db, ctx.tenantId, retentionMonths);

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "lgpd.retention_run",
    metadata: { retentionMonths, count },
  });

  revalidatePath("/admin/lgpd");
  return { count, retentionMonths };
}
