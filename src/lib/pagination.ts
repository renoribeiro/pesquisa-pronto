/**
 * Helpers de paginação por cursor (seek) — escala melhor que offset/skip, que
 * degrada linearmente com o deslocamento em tabelas grandes.
 *
 * O cursor é o `id` do último item da página. O `orderBy` da query DEVE incluir
 * um campo único (tipicamente `id`) como desempate para que o seek seja estável
 * e determinístico (ex.: `[{ createdAt: "desc" }, { id: "desc" }]`).
 */

export interface CursorArgs {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

/**
 * Constrói os args de cursor do Prisma. Sem `cursor`, retorna apenas `take`
 * (primeira página). Com `cursor`, posiciona após o item do cursor (`skip: 1`).
 */
export function cursorArgs(cursor: string | undefined, pageSize: number): CursorArgs {
  if (!cursor) return { take: pageSize };
  return { take: pageSize, cursor: { id: cursor }, skip: 1 };
}

/**
 * Deriva o `nextCursor` a partir da página retornada: o id do último item quando
 * a página veio cheia (há possível continuação); `null` caso contrário.
 */
export function nextCursorFrom<T extends { id: string }>(
  items: T[],
  pageSize: number,
): string | null {
  return items.length === pageSize ? items[items.length - 1]!.id : null;
}
