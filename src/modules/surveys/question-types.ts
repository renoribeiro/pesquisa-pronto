import type { QuestionType } from "@prisma/client";

/**
 * Metadados dos 12 tipos de pergunta (escopo §3.2.2).
 * `hasOptions`: usa QuestionOption. `defaultConfig`: config inicial do tipo.
 */
export interface QuestionTypeMeta {
  type: QuestionType;
  label: string;
  description: string;
  hasOptions: boolean;
  defaultConfig: Record<string, unknown>;
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  {
    type: "NPS",
    label: "NPS Clássico",
    description: "Escala 0–10 com justificativa condicional",
    hasOptions: false,
    defaultConfig: { min: 0, max: 10, lowLabel: "Nada provável", highLabel: "Muito provável" },
  },
  {
    type: "STAR_RATING",
    label: "Estrelas",
    description: "Avaliação de 1 a 5 estrelas",
    hasOptions: false,
    defaultConfig: { max: 5 },
  },
  {
    type: "STAR_RATING_TEXT",
    label: "Estrelas + Texto",
    description: "Estrelas com campo de justificativa",
    hasOptions: false,
    defaultConfig: { max: 5, textRequired: false },
  },
  {
    type: "EMOJI",
    label: "Emojis",
    description: "3, 4 ou 5 ícones expressivos",
    hasOptions: false,
    defaultConfig: { scale: 5, set: ["😞", "😐", "🙂", "😊", "😁"] },
  },
  {
    type: "MULTIPLE_CHOICE",
    label: "Múltipla Escolha",
    description: "Seleção única",
    hasOptions: true,
    defaultConfig: { allowOther: false },
  },
  {
    type: "CHECKBOX",
    label: "Caixa de Seleção",
    description: "Seleção múltipla com limite opcional",
    hasOptions: true,
    defaultConfig: { maxSelections: null },
  },
  {
    type: "DROPDOWN",
    label: "Menu Suspenso",
    description: "Seleção em lista longa",
    hasOptions: true,
    defaultConfig: {},
  },
  {
    type: "TEXT",
    label: "Texto Livre",
    description: "Campo aberto curto ou longo",
    hasOptions: false,
    defaultConfig: { multiline: true, maxLength: 1000 },
  },
  {
    type: "NUMERIC_SCALE",
    label: "Escala Numérica",
    description: "Escala configurável (1–5, 1–7, 1–10)",
    hasOptions: false,
    defaultConfig: { min: 1, max: 5, lowLabel: "", highLabel: "" },
  },
  {
    type: "MATRIX",
    label: "Matriz de Avaliação",
    description: "Grade de itens × escala",
    hasOptions: false,
    defaultConfig: { rows: ["Item 1"], columns: ["Ruim", "Regular", "Bom", "Ótimo"] },
  },
  {
    type: "DATETIME",
    label: "Data/Hora",
    description: "Seletor de data e/ou hora",
    hasOptions: false,
    defaultConfig: { mode: "date" },
  },
  {
    type: "RANKING",
    label: "Ranking",
    description: "Ordenar itens por preferência",
    hasOptions: true,
    defaultConfig: {},
  },
];

export const QUESTION_TYPE_MAP: Record<QuestionType, QuestionTypeMeta> = Object.fromEntries(
  QUESTION_TYPES.map((q) => [q.type, q]),
) as Record<QuestionType, QuestionTypeMeta>;

/** Tipos que computam NPS (para denormalização e analytics). */
export function isNpsType(type: QuestionType): boolean {
  return type === "NPS";
}
