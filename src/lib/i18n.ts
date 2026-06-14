/**
 * Internacionalização (M3.5). Módulo PURO (sem env/IO) — seguro para client,
 * server e testes. Dicionários por locale; o formulário público é a superfície
 * traduzida (pt-BR padrão, en, es). O painel admin permanece em pt-BR e migra
 * incrementalmente usando este mesmo mecanismo.
 */

export const LOCALES = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português",
  en: "English",
  es: "Español",
};

export interface FormDictionary {
  thankYouTitle: string;
  thankYouDefault: string;
  redirecting: string;
  requiredFields: string;
  privacyRequired: string;
  submit: string;
  submitting: string;
  previous: string;
  next: string;
  /** Template com {current} e {total}. */
  questionProgress: string;
  shortcutsLabel: string;
  shortcutSelect: string;
  shortcutAdvance: string;
  sslProtected: string;
}

export interface Dictionary {
  form: FormDictionary;
}

const pt: Dictionary = {
  form: {
    thankYouTitle: "Obrigado!",
    thankYouDefault: "Sua resposta foi registrada com sucesso.",
    redirecting: "Redirecionando em alguns segundos...",
    requiredFields: "Por favor, responda todas as perguntas obrigatórias.",
    privacyRequired: "Você precisa aceitar a política de privacidade para continuar.",
    submit: "Enviar respostas",
    submitting: "Enviando...",
    previous: "Anterior",
    next: "Próxima",
    questionProgress: "Pergunta {current} de {total}",
    shortcutsLabel: "Atalhos:",
    shortcutSelect: "Selecionar",
    shortcutAdvance: "Avançar",
    sslProtected: "Respostas protegidas por criptografia SSL segura",
  },
};

const en: Dictionary = {
  form: {
    thankYouTitle: "Thank you!",
    thankYouDefault: "Your response was successfully recorded.",
    redirecting: "Redirecting in a few seconds...",
    requiredFields: "Please answer all required questions.",
    privacyRequired: "You must accept the privacy policy to continue.",
    submit: "Submit answers",
    submitting: "Submitting...",
    previous: "Previous",
    next: "Next",
    questionProgress: "Question {current} of {total}",
    shortcutsLabel: "Shortcuts:",
    shortcutSelect: "Select",
    shortcutAdvance: "Continue",
    sslProtected: "Answers protected by secure SSL encryption",
  },
};

const es: Dictionary = {
  form: {
    thankYouTitle: "¡Gracias!",
    thankYouDefault: "Su respuesta se registró correctamente.",
    redirecting: "Redirigiendo en unos segundos...",
    requiredFields: "Por favor, responda todas las preguntas obligatorias.",
    privacyRequired: "Debe aceptar la política de privacidad para continuar.",
    submit: "Enviar respuestas",
    submitting: "Enviando...",
    previous: "Anterior",
    next: "Siguiente",
    questionProgress: "Pregunta {current} de {total}",
    shortcutsLabel: "Atajos:",
    shortcutSelect: "Seleccionar",
    shortcutAdvance: "Avanzar",
    sslProtected: "Respuestas protegidas con cifrado SSL seguro",
  },
};

const DICTIONARIES: Record<Locale, Dictionary> = { "pt-BR": pt, en, es };

/** Resolve um valor livre (cookie ou Accept-Language) para um Locale suportado. */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const v = value.trim().toLowerCase();
  if (v.startsWith("pt")) return "pt-BR";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";
  return DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** Interpola {chaves} de um template com os valores fornecidos. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}
