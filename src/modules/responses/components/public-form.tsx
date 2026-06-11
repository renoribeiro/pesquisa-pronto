"use client";

import { useState, useEffect, useCallback } from "react";
import type { QuestionType } from "@prisma/client";
import { QuestionRenderer, type RenderQuestion } from "@/modules/surveys/components/question-renderer";
import { computeVisibility, type SkipRule } from "@/modules/surveys/logic";
import { submitResponse, type SubmitResult } from "@/modules/responses/actions";
import { themeToStyleString, type ThemeConfig } from "@/modules/themes/theme-config";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────

export interface PublicQuestion extends RenderQuestion {
  type: QuestionType;
  order: number;
}

export interface PublicSurvey {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  pageMode: "ONE_PER_PAGE" | "ALL_IN_ONE";
  showProgress: boolean;
  allowMultiple: boolean;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  themeConfig: ThemeConfig | null;
  privacyPolicy: string | null;
  questions: PublicQuestion[];
  rules: SkipRule[];
  distributionId?: string;
}

// ── Draft saving (localStorage) ───────────────────────────────

function draftKey(surveyId: string) {
  return `ps_draft_${surveyId}`;
}

function loadDraft(surveyId: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(draftKey(surveyId));
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function saveDraft(surveyId: string, answers: Record<string, unknown>) {
  try {
    localStorage.setItem(draftKey(surveyId), JSON.stringify(answers));
  } catch {
    // quota exceeded or SSR
  }
}

function clearDraft(surveyId: string) {
  try {
    localStorage.removeItem(draftKey(surveyId));
  } catch {
    // ignore
  }
}

// ── Progress bar ──────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="mb-6 h-2 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// ── Thank-you screen ──────────────────────────────────────────

function ThankYou({ message, redirectUrl }: { message: string | null; redirectUrl: string | null }) {
  useEffect(() => {
    if (redirectUrl) {
      const t = setTimeout(() => {
        window.location.href = redirectUrl;
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [redirectUrl]);

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
      <div className="text-5xl" aria-hidden>
        ✅
      </div>
      <h2 className="text-2xl font-semibold">Obrigado!</h2>
      <p className="text-muted-foreground">
        {message ?? "Sua resposta foi registrada com sucesso."}
      </p>
      {redirectUrl && (
        <p className="text-sm text-muted-foreground">Redirecionando em alguns segundos...</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function PublicForm({ survey }: { survey: PublicSurvey }) {
  const [startedAt] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => loadDraft(survey.id));
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  // Anti-bot: honeypot
  const [honeypot, setHoneypot] = useState("");

  const questionIds = survey.questions.map((q) => q.id);
  const visibility = computeVisibility(questionIds, survey.rules, answers);
  const visibleQuestions = survey.questions.filter((q) => visibility[q.id] !== false);

  const isOnePage = survey.pageMode === "ALL_IN_ONE";

  // Pages in ONE_PER_PAGE mode: one question per page
  const pages = isOnePage ? [visibleQuestions] : visibleQuestions.map((q) => [q]);
  const currentPageQuestions = pages[page] ?? [];
  const totalPages = pages.length;
  const isLastPage = page === totalPages - 1;

  const progressValue = totalPages > 0 ? ((page + 1) / totalPages) * 100 : 100;

  const setAnswer = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        saveDraft(survey.id, next);
        return next;
      });
    },
    [survey.id],
  );

  function currentPageValid(): boolean {
    return currentPageQuestions.every((q) => {
      if (!q.required) return true;
      const val = answers[q.id];
      return val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
    });
  }

  function nextPage() {
    if (!currentPageValid()) {
      setError("Por favor, responda todas as perguntas obrigatórias.");
      return;
    }
    setError(null);
    setPage((p) => Math.min(p + 1, totalPages - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function prevPage() {
    setError(null);
    setPage((p) => Math.max(p - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Anti-bot check
    if (honeypot) return;

    if (!currentPageValid()) {
      setError("Por favor, responda todas as perguntas obrigatórias.");
      return;
    }

    if (survey.privacyPolicy && !consentGiven) {
      setError("Você precisa aceitar a política de privacidade para continuar.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const answersPayload = Object.entries(answers).map(([questionId, value]) => ({
      questionId,
      value,
    }));

    const result: SubmitResult = await submitResponse({
      surveyId: survey.id,
      tenantId: survey.tenantId,
      distributionId: survey.distributionId,
      answers: answersPayload,
      consentGiven: consentGiven || !survey.privacyPolicy,
      startedAt: startedAt,
      anonymous: false,
    });

    setSubmitting(false);

    if (result.ok) {
      clearDraft(survey.id);
      setSubmitted(true);
    } else {
      setError(result.error);
    }
  }

  // Apply theme CSS vars
  const themeStyle = survey.themeConfig
    ? themeToStyleString(survey.themeConfig)
    : null;

  if (submitted) {
    return (
      <SurveyWrapper themeStyle={themeStyle}>
        <ThankYou message={survey.thankYouMessage} redirectUrl={survey.redirectUrl} />
      </SurveyWrapper>
    );
  }

  return (
    <SurveyWrapper themeStyle={themeStyle}>
      <form onSubmit={handleSubmit} noValidate>
        {/* Anti-bot honeypot — hidden from real users */}
        <input
          tabIndex={-1}
          aria-hidden="true"
          name="website"
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, width: 0 }}
        />

        {/* Survey header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{survey.title}</h1>
          {survey.description && (
            <p className="mt-1 text-muted-foreground">{survey.description}</p>
          )}
        </div>

        {/* Progress bar */}
        {survey.showProgress && totalPages > 1 && (
          <ProgressBar value={progressValue} />
        )}

        {/* Questions */}
        <div className="space-y-6">
          {currentPageQuestions.map((q) => (
            <QuestionRenderer
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
              disabled={submitting}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Privacy policy consent */}
        {isLastPage && survey.privacyPolicy && (
          <div className="mt-6 flex items-start gap-2">
            <input
              id="consent"
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              required
              className="mt-1"
            />
            <label htmlFor="consent" className="text-sm text-muted-foreground">
              {survey.privacyPolicy}
            </label>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          {!isOnePage && page > 0 ? (
            <Button type="button" variant="outline" onClick={prevPage} disabled={submitting}>
              Anterior
            </Button>
          ) : (
            <span />
          )}

          {isLastPage ? (
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar respostas"}
            </Button>
          ) : (
            <Button type="button" onClick={nextPage} disabled={submitting}>
              Próxima
            </Button>
          )}
        </div>

        {/* Page indicator */}
        {!isOnePage && totalPages > 1 && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {page + 1} de {totalPages}
          </p>
        )}
      </form>
    </SurveyWrapper>
  );
}

function SurveyWrapper({
  children,
  themeStyle,
}: {
  children: React.ReactNode;
  themeStyle: string | null;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--ps-page-bg, var(--background))" }}
      data-survey-wrapper
    >
      {themeStyle && (
        <style>{`[data-survey-wrapper]{${themeStyle}}`}</style>
      )}
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{
            background: "var(--ps-card-bg, var(--card))",
            color: "var(--ps-text, var(--foreground))",
            fontFamily: "var(--ps-font-family, inherit)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
