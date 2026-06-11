"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { QuestionType, SurveyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { hashPassword } from "@/lib/password";

const optionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  order: z.number().int(),
  allowOther: z.boolean().default(false),
});

const questionSchema = z.object({
  key: z.string(), // id local do builder (estável durante a edição)
  type: z.nativeEnum(QuestionType),
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  order: z.number().int(),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z.array(optionSchema).default([]),
});

const conditionSchema = z.object({
  questionKey: z.string(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]),
  value: z.unknown(),
});

const ruleSchema = z.object({
  targetQuestionKey: z.string(),
  action: z.enum(["SHOW", "HIDE"]),
  join: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(conditionSchema).default([]),
});

const saveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  slug: z.string().optional(),
  pageMode: z.enum(["ONE_PER_PAGE", "ALL_IN_ONE"]).default("ONE_PER_PAGE"),
  showProgress: z.boolean().default(true),
  randomize: z.boolean().default(false),
  allowMultiple: z.boolean().default(false),
  responseLimit: z.number().int().positive().nullable().optional(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  thankYouMessage: z.string().optional(),
  redirectUrl: z.string().url().nullable().optional().or(z.literal("")),
  password: z.string().optional(),
  themeId: z.string().nullable().optional(),
  sectorIds: z.array(z.string()).default([]),
  touchPointIds: z.array(z.string()).default([]),
  questions: z.array(questionSchema).default([]),
  rules: z.array(ruleSchema).default([]),
});

async function uniqueSlug(tenantId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "pesquisa";
  let candidate = root;
  let i = 1;
  // Loop até achar slug livre no tenant
  while (true) {
    const existing = await prisma.survey.findFirst({
      where: { tenantId, slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${root}-${++i}`;
  }
}

/** Cria uma pesquisa em rascunho e retorna o id. */
export async function createSurvey(title: string): Promise<string> {
  const { ctx } = await requirePermission("survey:create");
  const slug = await uniqueSlug(ctx.tenantId, title);
  const survey = await prisma.survey.create({
    data: {
      tenantId: ctx.tenantId,
      title,
      slug,
      status: SurveyStatus.DRAFT,
      createdById: ctx.userId,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "survey.create",
    entity: "Survey",
    entityId: survey.id,
  });
  revalidatePath("/admin/surveys");
  return survey.id;
}

/** Salva o estado completo do builder (substitui perguntas/regras). */
export async function saveSurvey(surveyId: string, input: unknown) {
  const { ctx } = await requirePermission("survey:create");
  const data = saveSchema.parse(input);

  const survey = await prisma.survey.findFirst({
    where: { id: surveyId, tenantId: ctx.tenantId },
  });
  if (!survey) throw new Error("Pesquisa não encontrada.");

  const slug =
    data.slug && data.slug !== survey.slug
      ? await uniqueSlug(ctx.tenantId, data.slug, surveyId)
      : survey.slug;

  const passwordHash = data.password ? await hashPassword(data.password) : survey.passwordHash;

  await prisma.$transaction(async (tx) => {
    await tx.survey.update({
      where: { id: surveyId },
      data: {
        title: data.title,
        description: data.description ?? null,
        slug,
        pageMode: data.pageMode,
        showProgress: data.showProgress,
        randomize: data.randomize,
        allowMultiple: data.allowMultiple,
        responseLimit: data.responseLimit ?? null,
        opensAt: data.opensAt ? new Date(data.opensAt) : null,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        thankYouMessage: data.thankYouMessage ?? null,
        redirectUrl: data.redirectUrl || null,
        passwordHash,
        themeId: data.themeId ?? null,
        sectors: { set: data.sectorIds.map((id) => ({ id })) },
        touchPoints: { set: data.touchPointIds.map((id) => ({ id })) },
      },
    });

    // Substitui perguntas (cascade remove options/answers órfãos via FK)
    await tx.question.deleteMany({ where: { surveyId, tenantId: ctx.tenantId } });
    await tx.skipLogicRule.deleteMany({ where: { surveyId, tenantId: ctx.tenantId } });

    const keyToId = new Map<string, string>();
    for (const q of data.questions) {
      const created = await tx.question.create({
        data: {
          tenantId: ctx.tenantId,
          surveyId,
          type: q.type,
          title: q.title,
          description: q.description ?? null,
          required: q.required,
          order: q.order,
          config: (q.config ?? {}) as object,
          options: {
            create: q.options.map((o) => ({
              tenantId: ctx.tenantId,
              label: o.label,
              value: o.value,
              order: o.order,
              allowOther: o.allowOther,
            })),
          },
        },
      });
      keyToId.set(q.key, created.id);
    }

    for (const r of data.rules) {
      const targetId = keyToId.get(r.targetQuestionKey);
      if (!targetId) continue;
      const conditions = r.conditions
        .map((c) => ({
          questionId: keyToId.get(c.questionKey),
          operator: c.operator,
          value: c.value,
        }))
        .filter((c) => c.questionId);
      await tx.skipLogicRule.create({
        data: {
          tenantId: ctx.tenantId,
          surveyId,
          targetQuestionId: targetId,
          action: r.action,
          join: r.join,
          conditions: conditions as object,
        },
      });
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "survey.update",
    entity: "Survey",
    entityId: surveyId,
  });
  revalidatePath(`/admin/surveys/${surveyId}`);
  revalidatePath("/admin/surveys");
}

export async function setSurveyStatus(surveyId: string, status: SurveyStatus) {
  const { ctx, db } = await requirePermission("survey:create");
  await db.survey.update({ where: { id: surveyId }, data: { status } });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: `survey.status.${status.toLowerCase()}`,
    entity: "Survey",
    entityId: surveyId,
  });
  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${surveyId}`);
}

export async function deleteSurvey(surveyId: string) {
  const { ctx, db } = await requirePermission("survey:create");
  await db.survey.delete({ where: { id: surveyId } });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "survey.delete",
    entity: "Survey",
    entityId: surveyId,
  });
  revalidatePath("/admin/surveys");
}
