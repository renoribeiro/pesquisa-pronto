/**
 * Lógica pura de pesquisas: classificação NPS, avaliação de skip logic.
 * Sem dependências de I/O — totalmente testável.
 */

export type NpsClass = "promoter" | "passive" | "detractor";

export function classifyNps(score: number): NpsClass {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/**
 * Calcula o NPS (-100 a 100) a partir de uma lista de notas 0–10.
 * NPS = %promotores − %detratores.
 */
export function calculateNps(scores: number[]): number {
  if (scores.length === 0) return 0;
  let promoters = 0;
  let detractors = 0;
  for (const s of scores) {
    const c = classifyNps(s);
    if (c === "promoter") promoters++;
    else if (c === "detractor") detractors++;
  }
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

// ── Skip logic ─────────────────────────────────────────────────

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in";

export interface SkipCondition {
  questionId: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface SkipRule {
  targetQuestionId: string;
  action: "SHOW" | "HIDE";
  join: "AND" | "OR";
  conditions: SkipCondition[];
}

/**
 * Comparação "frouxa" de igualdade: se ambos os valores são coercíveis para
 * número (e não-vazios), compara numericamente (1 == "1"); caso contrário
 * compara por String(). Isso resolve a skip logic onde a resposta é number e
 * o valor configurado no builder é string.
 */
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  const aNum = a !== "" && a != null && !Number.isNaN(na);
  const bNum = b !== "" && b != null && !Number.isNaN(nb);
  if (aNum && bNum) return na === nb;
  return String(a ?? "") === String(b ?? "");
}

function evalCondition(cond: SkipCondition, answers: Record<string, unknown>): boolean {
  const actual = answers[cond.questionId];
  const expected = cond.value;
  switch (cond.operator) {
    case "eq":
      return looseEq(actual, expected);
    case "neq":
      return !looseEq(actual, expected);
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      if (Array.isArray(actual)) return actual.some((a) => looseEq(a, expected));
      return String(actual ?? "").includes(String(expected ?? ""));
    case "in":
      return Array.isArray(expected) && expected.some((e) => looseEq(actual, e));
    default:
      return false;
  }
}

function ruleMatches(rule: SkipRule, answers: Record<string, unknown>): boolean {
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => evalCondition(c, answers));
  return rule.join === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Decide a visibilidade de cada pergunta dado o estado atual de respostas.
 * Por padrão toda pergunta é visível. Uma regra SHOW só exibe se casar;
 * uma regra HIDE oculta se casar. Regras posteriores prevalecem.
 */
export function computeVisibility(
  questionIds: string[],
  rules: SkipRule[],
  answers: Record<string, unknown>,
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const id of questionIds) visibility[id] = true;

  // Pré-marca perguntas com regra SHOW como ocultas até casarem.
  for (const rule of rules) {
    if (rule.action === "SHOW") visibility[rule.targetQuestionId] = false;
  }

  for (const rule of rules) {
    const matched = ruleMatches(rule, answers);
    if (rule.action === "SHOW" && matched) visibility[rule.targetQuestionId] = true;
    if (rule.action === "HIDE" && matched) visibility[rule.targetQuestionId] = false;
  }
  return visibility;
}
