import { describe, it, expect } from "vitest";
import { detectNegativeTrend, isLowVolume } from "@/modules/alerts/evaluation";

describe("detectNegativeTrend", () => {
  it("detecta queda acima do limiar padrão (10)", () => {
    expect(detectNegativeTrend(50, 65)).toEqual({ isNegative: true, drop: 15 });
  });
  it("não detecta queda abaixo do limiar", () => {
    expect(detectNegativeTrend(60, 65)).toEqual({ isNegative: false, drop: 5 });
  });
  it("não detecta melhora de NPS", () => {
    expect(detectNegativeTrend(70, 60).isNegative).toBe(false);
  });
  it("respeita limiar configurado", () => {
    expect(detectNegativeTrend(60, 65, { minDrop: 5 }).isNegative).toBe(true);
  });
});

describe("isLowVolume", () => {
  it("dispara quando a semana atual cai abaixo do mínimo havendo atividade prévia", () => {
    expect(isLowVolume(2, 8, 5)).toBe(true);
  });
  it("não dispara quando o volume está no/acima do mínimo", () => {
    expect(isLowVolume(5, 8, 5)).toBe(false);
  });
  it("não dispara para tenant sem atividade prévia (evita ruído perpétuo)", () => {
    expect(isLowVolume(0, 0, 5)).toBe(false);
  });
  it("usa o mínimo padrão (5) quando não informado", () => {
    expect(isLowVolume(3, 10)).toBe(true);
    expect(isLowVolume(6, 10)).toBe(false);
  });
});
