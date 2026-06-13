"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { SurveyStatus, ChannelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forTenant } from "@/lib/tenant";
import { parseUserAgent } from "@/lib/user-agent";
import { enqueueAnalyzeResponse } from "@/server/queues";
import { checkAlerts } from "@/modules/alerts/actions";
import { rateLimit } from "@/lib/rate-limit";

const answerSchema = z.object({
  questionId: z.string(),
  value: z.unknown(),
});

const submitSchema = z.object({
  surveyId: z.string(),
  tenantId: z.string(),
  distributionId: z.string().optional(),
  recipientToken: z.string().optional(),
  answers: z.array(answerSchema),
  consentGiven: z.boolean(),
  startedAt: z.number(),
  anonymous: z.boolean().default(false),
});

export type SubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; error: string };

/** Sinaliza limite de respostas atingido dentro da transação. */
class ResponseLimitError extends Error {}

export async function submitResponse(input: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const d = parsed.data;

  // Busca pela survey apenas pelo id: o tenantId é DERIVADO da survey, nunca
  // confiado a partir do input do cliente (evita IDOR / cross-tenant).
  const survey = await prisma.survey.findUnique({
    where: { id: d.surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      tenant: { select: { privacyPolicy: true } },
    },
  });
  if (!survey) return { ok: false, error: "Pesquisa não encontrada." };

  // Fonte da verdade para o tenant é a própria survey.
  const tenantId = survey.tenantId;
  // Cliente escopado: todas as consultas a modelos com tenantId daqui em diante
  // passam pelo tenant guard (reforça o isolamento além do anti-IDOR manual).
  const db = forTenant(tenantId);

  if (survey.status !== SurveyStatus.PUBLISHED) {
    return { ok: false, error: "Esta pesquisa não está ativa." };
  }

  const now = new Date();
  if (survey.opensAt && now < survey.opensAt) {
    return { ok: false, error: "Esta pesquisa ainda não está aberta." };
  }
  if (survey.closesAt && now > survey.closesAt) {
    return { ok: false, error: "Esta pesquisa foi encerrada." };
  }

  // Validate that all answered questions belong to this survey (E3)
  const validQuestionIds = new Set(survey.questions.map((q) => q.id));
  const hasInvalid = d.answers.some((a) => !validQuestionIds.has(a.questionId));
  if (hasInvalid) {
    return { ok: false, error: "Contém respostas a perguntas inválidas para esta pesquisa." };
  }

  // Validate required answers
  for (const q of survey.questions) {
    if (!q.required) continue;
    const answer = d.answers.find((a) => a.questionId === q.id);
    const val = answer?.value;
    if (
      val === null ||
      val === undefined ||
      val === "" ||
      (Array.isArray(val) && val.length === 0)
    ) {
      return { ok: false, error: `Resposta obrigatória: ${q.title}` };
    }
  }

  // Recipient lookup + duplicate guard
  let recipientId: string | undefined;
  if (d.recipientToken) {
    // findFirst (não findUnique): o tenant guard injeta tenantId no where, o que
    // torna o critério não-único; o token continua sendo o filtro efetivo e a
    // pertença ao tenant é garantida pelo guard.
    const recipient = await db.recipient.findFirst({
      where: { token: d.recipientToken },
      select: { id: true, surveyId: true, optedOut: true },
    });
    if (recipient && recipient.surveyId === d.surveyId) {
      if (recipient.optedOut) return { ok: false, error: "Você optou por não participar." };
      if (!survey.allowMultiple) {
        const existing = await db.response.findFirst({
          where: { surveyId: d.surveyId, recipientId: recipient.id, completed: true },
          select: { id: true },
        });
        if (existing) return { ok: false, error: "Você já respondeu esta pesquisa." };
      }
      recipientId = recipient.id;
    }
  }

  // IP hash (LGPD)
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? "";
  const rawIp =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ?? hdrs.get("x-real-ip") ?? "";
  // Hash completo do IP (64 hex chars). Truncar demais (ex.: 20 chars) reduz a
  // entropia a ponto de viabilizar colisões/força-bruta; mantemos o digest inteiro.
  const ipHash = rawIp
    ? crypto.createHash("sha256").update(rawIp).digest("hex")
    : null;

  const { deviceType, os, browser } = parseUserAgent(ua);

  // Rate Limit (E5)
  if (ipHash) {
    const limitResult = await rateLimit(`submit:${ipHash}:${d.surveyId}`, 10, 3600);
    if (!limitResult.allowed) {
      return { ok: false, error: "Muitas respostas enviadas deste dispositivo. Tente novamente mais tarde." };
    }
  }

  const npsQ = survey.questions.find((q) => q.type === "NPS");
  const npsAns = npsQ ? d.answers.find((a) => a.questionId === npsQ.id) : null;
  const npsScore = npsAns != null ? Number(npsAns.value) : null;
  const durationMs = now.getTime() - d.startedAt;

  // Valida que a distribution informada pertence a esta survey/tenant.
  let distributionId: string | null = null;
  if (d.distributionId) {
    // findFirst via tenant guard (tenantId injetado no where torna o critério
    // não-único); a pertença ao tenant é garantida pelo guard.
    const dist = await db.distribution.findFirst({
      where: { id: d.distributionId },
      select: { id: true, surveyId: true },
    });
    if (dist && dist.surveyId === d.surveyId) {
      distributionId = dist.id;
    }
  }

  let response;
  try {
    response = await prisma.$transaction(async (tx) => {
      // Checagem de limite DENTRO da transação (evita TOCTOU race).
      if (survey.responseLimit) {
        const count = await tx.response.count({
          where: { tenantId, surveyId: d.surveyId, completed: true },
        });
        if (count >= survey.responseLimit) {
          throw new ResponseLimitError();
        }
      }

      const r = await tx.response.create({
        data: {
          tenantId,
          surveyId: d.surveyId,
          distributionId,
          recipientId: recipientId ?? null,
          channel: ChannelType.LINK,
          deviceType,
          os,
          browser,
          durationMs: durationMs > 0 ? durationMs : null,
          npsScore: npsScore !== null && !isNaN(npsScore) ? npsScore : null,
          completed: true,
          consentAt: d.consentGiven ? now : null,
          ipHash,
          anonymous: d.anonymous,
          answers: {
            create: d.answers.map((a) => ({
              tenantId,
              questionId: a.questionId,
              value: (a.value ?? null) as object,
            })),
          },
        },
      });

      if (distributionId) {
        await tx.distribution.update({
          where: { id: distributionId },
          data: { responseCount: { increment: 1 } },
        });
      }

      return r;
    });
  } catch (err) {
    if (err instanceof ResponseLimitError) {
      return { ok: false, error: "Limite de respostas atingido." };
    }
    throw err;
  }

  // Check and trigger alerts
  try {
    await checkAlerts(tenantId, d.surveyId, npsScore, response.id);
  } catch (err) {
    console.error(`[submitResponse] erro ao checar alertas:`, err);
  }

  // Enqueue AI analysis (non-blocking)
  try {
    await enqueueAnalyzeResponse({ responseId: response.id, tenantId });
  } catch {
    // non-critical — worker may not be running locally
  }

  return { ok: true, responseId: response.id };
}
