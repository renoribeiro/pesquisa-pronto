import { describe, it, expect } from "vitest";
import {
  cosine,
  clusterByThreshold,
  dominantSentiment,
  countMatches,
  computeTrend,
  type EmbeddedItem,
} from "@/lib/topics";

function item(id: string, embedding: number[], sentiment: EmbeddedItem["sentiment"] = "NEUTRAL"): EmbeddedItem {
  return { id, responseId: `r-${id}`, sentiment, summary: `comentário ${id}`, embedding };
}

describe("topics — clustering por embeddings", () => {
  it("cosine de vetores iguais é 1 e ortogonais é 0", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("agrupa vetores próximos e separa distantes", () => {
    // Dois grupos bem separados (eixo x vs eixo y), 3 + 3.
    const items = [
      item("a", [1, 0]),
      item("b", [0.98, 0.02]),
      item("c", [0.95, 0.05]),
      item("d", [0, 1]),
      item("e", [0.02, 0.98]),
      item("f", [0.05, 0.95]),
    ];
    const clusters = clusterByThreshold(items, { threshold: 0.7, minSize: 2 });
    expect(clusters.length).toBe(2);
    expect(clusters[0].members.length).toBe(3);
    expect(clusters[1].members.length).toBe(3);
  });

  it("descarta clusters abaixo do tamanho mínimo", () => {
    const items = [item("a", [1, 0]), item("b", [0.99, 0.01]), item("c", [0, 1])];
    const clusters = clusterByThreshold(items, { threshold: 0.7, minSize: 2 });
    expect(clusters.length).toBe(1); // o vetor isolado (c) é descartado
  });

  it("dominantSentiment retorna a maioria", () => {
    const members = [
      item("a", [1, 0], "NEGATIVE"),
      item("b", [1, 0], "NEGATIVE"),
      item("c", [1, 0], "POSITIVE"),
    ];
    expect(dominantSentiment(members)).toBe("NEGATIVE");
  });

  it("countMatches conta itens próximos do centróide", () => {
    const centroid = [1, 0];
    const items = [item("a", [0.99, 0.01]), item("b", [0.95, 0.05]), item("c", [0, 1])];
    expect(countMatches(centroid, items, 0.7)).toBe(2);
  });

  it("computeTrend trata período anterior vazio como tema emergente (+100)", () => {
    expect(computeTrend(5, 0)).toBe(100);
    expect(computeTrend(0, 0)).toBe(0);
    expect(computeTrend(15, 10)).toBe(50);
    expect(computeTrend(5, 10)).toBe(-50);
  });
});
