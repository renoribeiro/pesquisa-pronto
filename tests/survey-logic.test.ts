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
});
