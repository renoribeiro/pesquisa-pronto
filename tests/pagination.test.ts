import { describe, it, expect } from "vitest";
import { cursorArgs, nextCursorFrom } from "@/lib/pagination";

/** Testes PUROS dos helpers de paginação por cursor de @/lib/pagination. */

describe("cursorArgs", () => {
  it("primeira página (sem cursor): apenas take", () => {
    expect(cursorArgs(undefined, 20)).toEqual({ take: 20 });
  });

  it("com cursor: posiciona após o item (skip 1)", () => {
    expect(cursorArgs("abc", 20)).toEqual({ take: 20, cursor: { id: "abc" }, skip: 1 });
  });

  it("respeita o pageSize informado", () => {
    expect(cursorArgs("x", 5).take).toBe(5);
  });
});

describe("nextCursorFrom", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id_${i}` }));

  it("página cheia → id do último item (possível continuação)", () => {
    expect(nextCursorFrom(items(20), 20)).toBe("id_19");
  });

  it("página parcial → null (fim)", () => {
    expect(nextCursorFrom(items(7), 20)).toBeNull();
  });

  it("vazia → null", () => {
    expect(nextCursorFrom([], 20)).toBeNull();
  });
});
