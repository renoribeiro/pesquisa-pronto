import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import {
  SurveyBuilder,
  type BuilderQuestion,
  type BuilderRule,
} from "@/modules/surveys/components/survey-builder";
import { DistributionPanel } from "@/modules/channels/components/distribution-panel";
import { BatchReport } from "@/modules/channels/components/batch-report";
import { listDispatchBatches } from "@/modules/channels/batch-actions";

export const metadata = { title: "Editar pesquisa — Pronto Satisfação" };

interface RuleCondition {
  questionId?: string;
  operator?: string;
  value?: unknown;
}

/** Normaliza config (JSON) para um objeto simples; ignora arrays/null/escalares. */
function asConfig(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export default async function SurveyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requirePermission("survey:create");

  const survey = await db.survey.findFirst({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      skipLogicRules: true,
      sectors: { select: { id: true } },
      touchPoints: { select: { id: true } },
    },
  });
  if (!survey) notFound();

  const [sectors, touchPoints, themes, batches] = await Promise.all([
    db.sector.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.touchPoint.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.theme.findMany({ orderBy: { name: "asc" } }),
    listDispatchBatches(id),
  ]);

  const questions: BuilderQuestion[] = survey.questions.map((q) => ({
    key: q.id,
    type: q.type,
    title: q.title,
    description: q.description ?? "",
    required: q.required,
    config: asConfig(q.config),
    options: q.options.map((o) => ({ label: o.label, value: o.value, allowOther: o.allowOther })),
  }));

  const rules: BuilderRule[] = survey.skipLogicRules.map((r) => {
    const conds = Array.isArray(r.conditions) ? (r.conditions as RuleCondition[]) : [];
    return {
      targetQuestionKey: r.targetQuestionId,
      action: r.action,
      join: r.join === "OR" ? "OR" : "AND",
      conditions: conds.map((c) => ({
        questionKey: String(c.questionId ?? ""),
        operator: String(c.operator ?? "eq"),
        value: c.value == null ? "" : String(c.value),
      })),
    };
  });

  return (
    <div className="space-y-8">
      <SurveyBuilder
      initial={{
        id: survey.id,
        title: survey.title,
        description: survey.description ?? "",
        slug: survey.slug,
        status: survey.status,
        pageMode: survey.pageMode,
        showProgress: survey.showProgress,
        randomize: survey.randomize,
        allowMultiple: survey.allowMultiple,
        thankYouMessage: survey.thankYouMessage ?? "",
        questions,
        rules,
        sectorIds: survey.sectors.map((s) => s.id),
        touchPointIds: survey.touchPoints.map((t) => t.id),
        themeId: survey.themeId ?? "",
      }}
      sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
      touchPoints={touchPoints.map((t) => ({ id: t.id, name: t.name }))}
      themes={themes.map((t) => ({ id: t.id, name: t.name }))}
    />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Distribuição</h2>
        <DistributionPanel surveyId={survey.id} surveySlug={survey.slug} />
      </div>
      <BatchReport surveyId={survey.id} initial={batches} />
    </div>
  );
}
