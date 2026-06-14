import { describe, it, expect } from "vitest";
import { stableStringify, npsCacheKey } from "@/lib/cache-key";

/** Testes PUROS dos helpers de chave de cache (sem Redis/env). */

describe("stableStringify", () => {
  it("ordena chaves de forma determinística (ordem de inserção não importa)", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("é estável para objetos aninhados", () => {
    const a = { survey: { sectors: { some: { id: { in: ["s1", "s2"] } } } } };
    const b = { survey: { sectors: { some: { id: { in: ["s1", "s2"] } } } } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("distingue valores diferentes", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });

  it("lida com primitivos e null", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });
});

describe("npsCacheKey", () => {
  it("inclui versão, tenant, survey e filtro de setor", () => {
    const key = npsCacheKey("3", "t1", "sv1", {});
    expect(key).toBe('nps:t1:3:sv1:{}');
  });

  it('usa "all" quando não há surveyId', () => {
    expect(npsCacheKey("0", "t1", undefined, {})).toBe('nps:t1:0:all:{}');
  });

  it("muda quando a versão muda (invalidação)", () => {
    expect(npsCacheKey("1", "t1", undefined, {})).not.toBe(npsCacheKey("2", "t1", undefined, {}));
  });

  it("muda quando o filtro de setor muda", () => {
    const a = npsCacheKey("1", "t1", undefined, {});
    const b = npsCacheKey("1", "t1", undefined, { survey: { sectors: { some: { id: { in: ["s1"] } } } } });
    expect(a).not.toBe(b);
  });
});
