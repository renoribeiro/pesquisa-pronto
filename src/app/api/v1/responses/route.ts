import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import { forTenant } from "@/lib/tenant";

const querySchema = z.object({
  surveyId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  since: z.string().datetime().optional(),
});

/**
 * GET /api/v1/responses
 * Lista respostas do tenant autenticado. Suporta filtros por survey e paginação.
 */
export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return apiError("Unauthorized", 401);

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const params = querySchema.safeParse(sp);
  if (!params.success) return apiError("Parâmetros inválidos.", 400);

  const { surveyId, page, pageSize, since } = params.data;
  const skip = (page - 1) * pageSize;

  const db = forTenant(ctx.tenantId);
  const where = {
    completed: true,
    ...(surveyId ? { surveyId } : {}),
    ...(since ? { createdAt: { gte: new Date(since) } } : {}),
  };

  const [responses, total] = await Promise.all([
    db.response.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        surveyId: true,
        channel: true,
        deviceType: true,
        npsScore: true,
        completed: true,
        createdAt: true,
        answers: {
          select: {
            questionId: true,
            value: true,
          },
        },
      },
    }),
    db.response.count({ where }),
  ]);

  return Response.json({
    data: responses,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
