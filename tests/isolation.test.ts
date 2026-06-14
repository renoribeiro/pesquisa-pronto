import { describe, it, expect } from "vitest";
import { surveySectorWhere, responseSectorWhere } from "@/lib/scope";

/**
 * Testes PUROS (sem DB) dos helpers de escopo de setor de @/lib/scope.
 *
 * Garantem o isolamento por setor do SECTOR_MANAGER:
 *  - escopo "all"      → sem restrição ({});
 *  - escopo "sector"   → restringe aos setores do usuário;
 *  - setores vazios    → sentinela que não casa nada (nada visível) — NUNCA tudo.
 */

const SENTINEL = "__no_sector__";

function makeCtx(sectorIds: string[]) {
  return { sectorIds };
}

describe("surveySectorWhere — escopo de setor sobre Survey", () => {
  it("escopo 'all' não impõe restrição de setor ({})", () => {
    const ctx = makeCtx(["s1", "s2"]);
    expect(surveySectorWhere(ctx, "all")).toEqual({});
  });

  it("escopo 'sector' filtra por sectors.some.id.in com os ctx.sectorIds", () => {
    const ctx = makeCtx(["s1", "s2"]);
    expect(surveySectorWhere(ctx, "sector")).toEqual({
      sectors: { some: { id: { in: ["s1", "s2"] } } },
    });
  });

  it("escopo 'sector' com sectorIds vazio usa sentinela que não casa nada", () => {
    const ctx = makeCtx([]);
    const where = surveySectorWhere(ctx, "sector");
    expect(where).toEqual({
      sectors: { some: { id: { in: [SENTINEL] } } },
    });
    // Defesa explícita: nunca pode virar {} (que veria TUDO) quando sem setores.
    expect(where).not.toEqual({});
  });
});

describe("responseSectorWhere — escopo de setor sobre Response (via survey)", () => {
  it("escopo 'all' não impõe restrição de setor ({})", () => {
    const ctx = makeCtx(["s1"]);
    expect(responseSectorWhere(ctx, "all")).toEqual({});
  });

  it("escopo 'sector' filtra pela relação survey.sectors.some.id.in", () => {
    const ctx = makeCtx(["s1", "s2", "s3"]);
    expect(responseSectorWhere(ctx, "sector")).toEqual({
      survey: { sectors: { some: { id: { in: ["s1", "s2", "s3"] } } } },
    });
  });

  it("escopo 'sector' com sectorIds vazio usa sentinela (nada visível)", () => {
    const ctx = makeCtx([]);
    const where = responseSectorWhere(ctx, "sector");
    expect(where).toEqual({
      survey: { sectors: { some: { id: { in: [SENTINEL] } } } },
    });
    expect(where).not.toEqual({});
  });
});

describe("isolamento — escopo 'none' é tratado como sem restrição de setor", () => {
  // scopeOf retorna "none" para perfis sem acesso; os helpers só aplicam filtro
  // quando scope === "sector". A barreira de acesso "none" é a requirePermission,
  // não estes helpers — então aqui apenas documentamos que !== "sector" → {}.
  it("qualquer escopo diferente de 'sector' não filtra por setor", () => {
    const ctx = makeCtx(["s1"]);
    expect(surveySectorWhere(ctx, "none")).toEqual({});
    expect(responseSectorWhere(ctx, "none")).toEqual({});
  });
});
