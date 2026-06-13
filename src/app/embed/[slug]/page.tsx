import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SurveyStatus } from "@prisma/client";
import { PublicForm } from "@/modules/responses/components/public-form";
import { themeConfigSchema } from "@/modules/themes/theme-config";
import type { SkipRule } from "@/modules/surveys/logic";

/**
 * Embed iframe route — renderiza apenas o formulário sem layout de página.
 * Uso: <iframe src="/embed/{slug}" />
 */
export default async function EmbedSurveyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // slug é único por tenant (não global) — findFirst com ordenação estável.
  const survey = await prisma.survey.findFirst({
    where: { slug },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
      skipLogicRules: true,
      theme: true,
      tenant: { select: { privacyPolicy: true } },
    },
  });

  if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
    return notFound();
  }

  const themeConfig =
    survey.theme ? themeConfigSchema.safeParse(survey.theme.config).data ?? null : null;

  const rules: SkipRule[] = survey.skipLogicRules.map((r) => ({
    targetQuestionId: r.targetQuestionId,
    action: r.action as "SHOW" | "HIDE",
    join: (r.join as "AND" | "OR") ?? "AND",
    conditions: (r.conditions as { questionId: string; operator: string; value: unknown }[]).map(
      (c) => ({
        questionId: c.questionId,
        operator: c.operator as SkipRule["conditions"][number]["operator"],
        value: c.value,
      }),
    ),
  }));

  const publicSurvey = {
    id: survey.id,
    tenantId: survey.tenantId,
    title: survey.title,
    description: survey.description,
    pageMode: survey.pageMode as "ONE_PER_PAGE" | "ALL_IN_ONE",
    showProgress: survey.showProgress,
    allowMultiple: survey.allowMultiple,
    thankYouMessage: survey.thankYouMessage,
    redirectUrl: null, // no redirect in embed
    themeConfig,
    privacyPolicy: survey.tenant.privacyPolicy,
    questions: survey.questions.map((q) => ({
      id: q.id,
      type: q.type,
      title: q.title,
      description: q.description,
      required: q.required,
      order: q.order,
      config: (q.config ?? {}) as Record<string, unknown>,
      options: q.options.map((o) => ({ id: o.id, label: o.label, value: o.value })),
    })),
    rules,
  };

  return <PublicForm survey={publicSurvey} />;
}
