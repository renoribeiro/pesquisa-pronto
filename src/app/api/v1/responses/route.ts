import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import { forTenant } from "@/lib/tenant";
import { cursorArgs, nextCursorFrom } from "@/lib/pagination";

const querySchema = z.object({
  surveyId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  since: z.string().datetime().optional(),
  // Paginação por cursor (recomendada para varrer grandes volumes). Quando
  // informado, tem precedência sobre `page` (offset).
  cursor: z.string().optional(),
});

const SELECT = {
  id: true,
  surveyId: true,
  channel: true,
  deviceType: true,
  npsScore: true,
  completed: true,
  createdAt: true,
  answers: { select: { questionId: true, value: true } },
} as const;

// Desempate por `id` torna o seek por cursor estável (createdAt não é único).
const ORDER_BY = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * GET /api/v1/responses
 * Lista respostas do tenant autenticado. Filtros por survey/`since` e duas
 * estratégias de paginação:
 *  - cursor (`?cursor=<id>`): seek eficiente, ideal para volume; retorna
 *    `pagination.nextCursor` para a próxima página;
 *  - offset (`?page=N`): retrocompatível, inclui `total`/`totalPages`.
 * Toda resposta inclui `nextCursor` para facilitar a migração para cursor.
 */
export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return apiError("Unauthorized", 401);

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const params = querySchema.safeParse(sp);
  if (!params.success) return apiError("Parâmetros inválidos.", 400);

  const { surveyId, page, pageSize, since, cursor } = params.data;

  const db = forTenant(ctx.tenantId);
  const where = {
    completed: true,
    ...(surveyId ? { surveyId } : {}),
    ...(since ? { createdAt: { gte: new Date(since) } } : {}),
  };

  const usesCursor = cursor !== undefined;

  const responses = await db.response.findMany({
    where,
    orderBy: ORDER_BY,
    select: SELECT,
    ...(usesCursor ? cursorArgs(cursor, pageSize) : { skip: (page - 1) * pageSize, take: pageSize }),
  });

  const nextCursor = nextCursorFrom(responses, pageSize);

  if (usesCursor) {
    return Response.json({
      data: responses,
      pagination: { pageSize, nextCursor },
    });
  }

  // Modo offset (retrocompatível): mantém total/totalPages.
  const total = await db.response.count({ where });
  return Response.json({
    data: responses,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      nextCursor,
    },
  });
}
