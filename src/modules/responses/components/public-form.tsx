"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { QuestionType } from "@prisma/client";
import { QuestionRenderer, type RenderQuestion } from "@/modules/surveys/components/question-renderer";
import { computeVisibility, type SkipRule } from "@/modules/surveys/logic";
import { submitResponse, type SubmitResult } from "@/modules/responses/actions";
import { themeToStyleString, type ThemeConfig } from "@/modules/themes/theme-config";
import { sanitizeCustomCss } from "@/lib/sanitize-css";
import { Button } from "@/components/ui/button";
import { ProntoclinicaLogo } from "@/components/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  getDictionary,
  interpolate,
  DEFAULT_LOCALE,
  type Locale,
  type FormDictionary,
} from "@/lib/i18n";

/**
 * Valida uma URL de redirecionamento ("obrigado"). Aceita apenas http(s)
 * absoluto; qualquer outra coisa (javascript:, data:, esquemas relativos
 * ambíguos, URLs inválidas) é descartada para evitar open redirect.
 */
function safeRedirectUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

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
      className="mb-8 h-3.5 overflow-hidden rounded-full shadow-neumorphic-inset bg-background p-[2px]"
    >
      <div
        className="h-full rounded-full bg-[#901A1E] transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

// ── Thank-you screen ──────────────────────────────────────────

function ThankYou({
  message,
  redirectUrl,
  t,
}: {
  message: string | null;
  redirectUrl: string | null;
  t: FormDictionary;
}) {
  const safeUrl = safeRedirectUrl(redirectUrl);
  useEffect(() => {
    if (safeUrl) {
      const timer = setTimeout(() => {
        window.location.href = safeUrl;
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [safeUrl]);

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center" role="status">
      <div className="h-16 w-16 rounded-full shadow-neumorphic-inset bg-background flex items-center justify-center mb-2 animate-bounce">
        <svg className="h-8 w-8 text-[#C5A059]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-[#3A3333]">{t.thankYouTitle}</h2>
      <p className="text-[#6E6565] font-medium max-w-md">{message ?? t.thankYouDefault}</p>
      {safeUrl && <p className="text-xs text-[#a8a0a0] font-medium">{t.redirecting}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function PublicForm({
  survey,
  locale = DEFAULT_LOCALE,
}: {
  survey: PublicSurvey;
  locale?: Locale;
}) {
  const t = getDictionary(locale).form;
  const [startedAt] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  // Anti-bot: honeypot
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(loadDraft(survey.id));
  }, [survey.id]);

  const questionIds = survey.questions.map((q) => q.id);
  const visibility = computeVisibility(questionIds, survey.rules, answers);
  const visibleQuestions = survey.questions.filter((q) => visibility[q.id] !== false);

  const isOnePage = survey.pageMode === "ALL_IN_ONE";

  // Pages in ONE_PER_PAGE mode: one question per page
  const pages = useMemo(() => {
    return isOnePage ? [visibleQuestions] : visibleQuestions.map((q) => [q]);
  }, [isOnePage, visibleQuestions]);

  const currentPageQuestions = useMemo(() => {
    return pages[page] ?? [];
  }, [pages, page]);

  const totalPages = pages.length;
  const isLastPage = page === totalPages - 1;

  const progressValue = totalPages > 0 ? ((page + 1) / totalPages) * 100 : 100;

  const currentPageValid = useCallback((): boolean => {
    return currentPageQuestions.every((q) => {
      if (!q.required) return true;
      const val = answers[q.id];
      return val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
    });
  }, [currentPageQuestions, answers]);

  const nextPage = useCallback(() => {
    if (!currentPageValid()) {
      setError(t.requiredFields);
      return;
    }
    setError(null);
    setPage((p) => Math.min(p + 1, totalPages - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPageValid, totalPages, t.requiredFields]);

  const prevPage = useCallback(() => {
    setError(null);
    setPage((p) => Math.max(p - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setAnswer = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        saveDraft(survey.id, next);
        return next;
      });

      // Auto-advance for single-selection types in one-question-per-page mode
      const question = survey.questions.find((q) => q.id === questionId);
      const isAutoAdvanceType =
        question &&
        ["NPS", "NUMERIC_SCALE", "EMOJI", "STAR_RATING", "MULTIPLE_CHOICE"].includes(
          question.type,
        );

      if (isAutoAdvanceType && !isOnePage) {
        setTimeout(() => {
          setPage((p) => Math.min(p + 1, totalPages - 1));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 400);
      }
    },
    [survey.id, survey.questions, isOnePage, totalPages],
  );

  // Global keydown shortcuts
  useEffect(() => {
    // Guarda um "1" recém-pressionado por um curto período para permitir
    // formar a nota 10 (tecla "1" seguida de "0") em perguntas NPS (0–10).
    let pendingTen: ReturnType<typeof setTimeout> | null = null;
    const clearPendingTen = () => {
      if (pendingTen) {
        clearTimeout(pendingTen);
        pendingTen = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in text inputs
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (isLastPage) {
            const form = document.querySelector("form");
            form?.requestSubmit();
          } else {
            nextPage();
          }
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (isLastPage) {
          const form = document.querySelector("form");
          form?.requestSubmit();
        } else {
          nextPage();
        }
      }

      // Selection shortcuts (A, B, C...)
      if (currentPageQuestions.length === 1) {
        const q = currentPageQuestions[0];
        if (q.type === "MULTIPLE_CHOICE" && q.options.length > 0) {
          const optionIndex = e.key.toLowerCase().charCodeAt(0) - 97;
          if (optionIndex >= 0 && optionIndex < q.options.length) {
            e.preventDefault();
            const option = q.options[optionIndex];
            setAnswer(q.id, option.value);
          }
        } else if (q.type === "NPS" || q.type === "NUMERIC_SCALE") {
          const digit = parseInt(e.key, 10);
          if (!isNaN(digit)) {
            e.preventDefault();
            if (q.type === "NPS") {
              // NPS aceita 0–10. Como "10" tem dois dígitos, ao receber "0"
              // logo após um "1" pendente, registra 10; caso contrário,
              // registra o dígito (0–9) e marca "1" como possível prefixo de 10.
              if (digit === 0 && pendingTen) {
                clearPendingTen();
                setAnswer(q.id, 10);
              } else if (digit >= 0 && digit <= 9) {
                clearPendingTen();
                setAnswer(q.id, digit);
                if (digit === 1) {
                  pendingTen = setTimeout(() => {
                    pendingTen = null;
                  }, 1000);
                }
              }
            } else if (q.type === "NUMERIC_SCALE") {
              const cfg = q.config ?? {};
              const min = Number(cfg.min ?? 1);
              const max = Number(cfg.max ?? 5);
              if (digit >= min && digit <= max) {
                setAnswer(q.id, digit);
              }
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearPendingTen();
    };
  }, [currentPageQuestions, nextPage, setAnswer, isLastPage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Anti-bot check
    if (honeypot) return;

    if (!currentPageValid()) {
      setError(t.requiredFields);
      return;
    }

    if (survey.privacyPolicy && !consentGiven) {
      setError(t.privacyRequired);
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
      // Só registra consentimento quando há uma política de privacidade E o
      // respondente realmente a aceitou — evita gravar consentAt falso.
      consentGiven: Boolean(survey.privacyPolicy) && consentGiven,
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
      <SurveyWrapper themeStyle={themeStyle} customCss={survey.themeConfig?.customCss ?? null}>
        <ThankYou message={survey.thankYouMessage} redirectUrl={survey.redirectUrl} t={t} />
      </SurveyWrapper>
    );
  }

  return (
    <SurveyWrapper themeStyle={themeStyle} customCss={survey.themeConfig?.customCss ?? null}>
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

        {/* Seletor de idioma */}
        <div className="mb-2 flex justify-end">
          <LocaleSwitcher current={locale} />
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <ProntoclinicaLogo />
        </div>

        {/* Survey header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#3A3333]">{survey.title}</h1>
          {survey.description && (
            <p className="mt-2 text-sm text-[#6E6565] font-medium">{survey.description}</p>
          )}
        </div>

        {/* Progress bar */}
        {survey.showProgress && totalPages > 1 && (
          <ProgressBar value={progressValue} />
        )}

        {/* Questions */}
        <div key={page} className="space-y-6 animate-slide-up">
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
            <Button 
              type="button" 
              onClick={prevPage} 
              disabled={submitting}
              className="bg-background hover:bg-[#E0DADA] text-[#3A3333] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-6 font-bold transition-all duration-300 active:translate-y-[0.5px] disabled:opacity-50 disabled:pointer-events-none"
            >
              {t.previous}
            </Button>
          ) : (
            <span />
          )}

          {isLastPage ? (
            <Button 
              type="submit" 
              disabled={submitting}
              className="bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-6 font-bold transition-all duration-300 active:translate-y-[0.5px] disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? t.submitting : t.submit}
            </Button>
          ) : (
            <Button 
              type="button" 
              onClick={nextPage} 
              disabled={submitting}
              className="bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-6 font-bold transition-all duration-300 active:translate-y-[0.5px] disabled:opacity-50 disabled:pointer-events-none"
            >
              {t.next}
            </Button>
          )}
        </div>

        {/* Page indicator & shortcuts helper */}
        {!isOnePage && totalPages > 1 && (
          <div className="mt-8 flex flex-col items-center gap-3 border-t pt-6 border-[#a8a0a0]/20">
            <p className="text-xs font-semibold text-[#6E6565]">
              {interpolate(t.questionProgress, { current: page + 1, total: totalPages })}
            </p>
            <div className="flex items-center gap-2 text-[10px] text-[#a8a0a0] font-medium">
              <span>{t.shortcutsLabel}</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md shadow-neumorphic-inset bg-background px-1.5 font-mono text-[9px] font-bold text-[#6E6565] border-0">
                [A-Z]
              </kbd>
              <span>{t.shortcutSelect}</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md shadow-neumorphic-inset bg-background px-1.5 font-mono text-[9px] font-bold text-[#6E6565] border-0">
                Enter ↵
              </kbd>
              <span>{t.shortcutAdvance}</span>
            </div>
          </div>
        )}

        {/* SSL Trust Seal */}
        <div className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-[#6E6565]/80 font-bold border-t pt-4 border-[#a8a0a0]/15">
          <svg className="h-3.5 w-3.5 text-[#C5A059] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>{t.sslProtected}</span>
        </div>
      </form>
    </SurveyWrapper>
  );
}

function SurveyWrapper({
  children,
  themeStyle,
  customCss,
}: {
  children: React.ReactNode;
  themeStyle: string | null;
  customCss: string | null;
}) {
  return (
    <div
      className="min-h-screen bg-background"
      style={{ background: "var(--ps-page-bg, var(--background))" }}
      data-survey-wrapper
    >
      {themeStyle && (
        <style>{`[data-survey-wrapper]{${themeStyle}}`}</style>
      )}
      {customCss && (() => {
        const safeCss = sanitizeCustomCss(customCss);
        return safeCss ? <style>{safeCss}</style> : null;
      })()}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div
          className="rounded-2xl bg-background shadow-neumorphic border-0 p-8 sm:p-12 transition-all duration-500"
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
