import { describe, it, expect } from "vitest";
import { classifyNps, calculateNps, computeVisibility, type SkipRule } from "@/modules/surveys/logic";

describe("NPS", () => {
  it("classifica corretamente", () => {
    expect(classifyNps(10)).toBe("promoter");
    expect(classifyNps(9)).toBe("promoter");
    expect(classifyNps(8)).toBe("passive");
    expect(classifyNps(7)).toBe("passive");
    expect(classifyNps(6)).toBe("detractor");
    expect(classifyNps(0)).toBe("detractor");
  });

  it("calcula o NPS agregado", () => {
    // 5 promotores, 3 detratores, 2 neutros → (50-30) = 20
    const scores = [10, 10, 9, 9, 9, 6, 5, 0, 7, 8];
    expect(calculateNps(scores)).toBe(20);
  });

  it("retorna 0 para lista vazia", () => {
    expect(calculateNps([])).toBe(0);
  });
});

describe("Skip logic", () => {
  const ids = ["q1", "q2", "q3"];

  it("SHOW exibe pergunta só quando a condição casa", () => {
    const rules: SkipRule[] = [
      {
        targetQuestionId: "q2",
        action: "SHOW",
        join: "AND",
        conditions: [{ questionId: "q1", operator: "lte", value: 6 }],
      },
    ];
    expect(computeVisibility(ids, rules, { q1: 5 }).q2).toBe(true);
    expect(computeVisibility(ids, rules, { q1: 9 }).q2).toBe(false);
  });

  it("HIDE oculta pergunta quando a condição casa", () => {
    const rules: SkipRule[] = [
      {
        targetQuestionId: "q3",
        action: "HIDE",
        join: "AND",
        conditions: [{ questionId: "q1", operator: "eq", value: "nao" }],
      },
    ];
    expect(computeVisibility(ids, rules, { q1: "nao" }).q3).toBe(false);
    expect(computeVisibility(ids, rules, { q1: "sim" }).q3).toBe(true);
  });

  it("combina condições com OR", () => {
    const rules: SkipRule[] = [
      {
        targetQuestionId: "q2",
        action: "SHOW",
        join: "OR",
        conditions: [
          { questionId: "q1", operator: "gte", value: 9 },
          { questionId: "q3", operator: "eq", value: "x" },
        ],
      },
    ];
    expect(computeVisibility(ids, rules, { q1: 9, q3: "y" }).q2).toBe(true);
    expect(computeVisibility(ids, rules, { q1: 2, q3: "y" }).q2).toBe(false);
  });

  it("eq/neq casam NPS numérico contra value string do builder (regressão H3)", () => {
    // No fluxo real a resposta NPS é number (10) e o value da condição vem do
    // builder como string ("10"). A comparação precisa ser type-agnostic.
    const showRule: SkipRule[] = [
      {
        targetQuestionId: "q2",
        action: "SHOW",
        join: "AND",
        conditions: [{ questionId: "q1", operator: "eq", value: "10" }],
      },
    ];
    // answer numérico 10 deve casar com "10" (antes: 10 === "10" → nunca casava)
    expect(computeVisibility(ids, showRule, { q1: 10 }).q2).toBe(true);
    expect(computeVisibility(ids, showRule, { q1: 9 }).q2).toBe(false);

    const hideRule: SkipRule[] = [
      {
        targetQuestionId: "q3",
        action: "HIDE",
        join: "AND",
        conditions: [{ questionId: "q1", operator: "neq", value: "0" }],
      },
    ];
    // neq: answer 5 (number) é diferente de "0" → HIDE aplica (oculta)
    expect(computeVisibility(ids, hideRule, { q1: 5 }).q3).toBe(false);
    // neq: answer 0 (number) NÃO é diferente de "0" → não oculta
    expect(computeVisibility(ids, hideRule, { q1: 0 }).q3).toBe(true);
  });
});
