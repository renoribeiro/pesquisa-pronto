import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SurveyStatus } from "@prisma/client";
import { PublicForm } from "@/modules/responses/components/public-form";
import { themeConfigSchema } from "@/modules/themes/theme-config";
import type { SkipRule } from "@/modules/surveys/logic";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const survey = await prisma.survey.findFirst({
    where: { slug },
    select: { title: true, description: true },
  });
  if (!survey) return { title: "Pesquisa não encontrada" };
  return { title: survey.title, description: survey.description ?? undefined };
}

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const survey = await prisma.survey.findFirst({
    where: { slug },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
      skipLogicRules: true,
      theme: true,
      tenant: { select: { privacyPolicy: true } },
      distributions: {
        where: { channel: "LINK" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!survey) return notFound();

  const now = new Date();

  // Status-based gates — render informational pages instead of 404
  if (survey.status === SurveyStatus.DRAFT || survey.status === SurveyStatus.ARCHIVED) {
    return <SurveyGate message="Esta pesquisa não está disponível." />;
  }

  if (survey.status === SurveyStatus.CLOSED) {
    return <SurveyGate message="Esta pesquisa foi encerrada. Obrigado pelo seu interesse." />;
  }

  if (survey.opensAt && now < survey.opensAt) {
    return (
      <SurveyGate
        message={`Esta pesquisa ainda não está aberta. Disponível a partir de ${survey.opensAt.toLocaleDateString("pt-BR")}.`}
      />
    );
  }

  if (survey.closesAt && now > survey.closesAt) {
    return <SurveyGate message="Esta pesquisa foi encerrada. Obrigado pelo seu interesse." />;
  }

  if (survey.responseLimit) {
    const count = await prisma.response.count({
      where: { surveyId: survey.id, completed: true },
    });
    if (count >= survey.responseLimit) {
      return <SurveyGate message="Limite de respostas atingido. Obrigado pela sua intenção!" />;
    }
  }

  // Parse theme
  const themeConfig =
    survey.theme ? themeConfigSchema.safeParse(survey.theme.config).data ?? null : null;

  // Parse skip logic rules
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
    redirectUrl: survey.redirectUrl,
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
    distributionId: survey.distributions[0]?.id,
  };

  return <PublicForm survey={publicSurvey} />;
}

function SurveyGate({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="max-w-md rounded-2xl bg-background shadow-neumorphic p-10 text-center border-0">
        <p className="text-[#6E6565] font-semibold text-base">{message}</p>
      </div>
    </div>
  );
}
