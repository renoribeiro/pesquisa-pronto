import { type NextRequest } from "next/server";
import { authenticateApiKey, apiError } from "@/lib/api-auth";
import { forTenant } from "@/lib/tenant";

/**
 * GET /api/v1/surveys
 * Lista pesquisas ativas do tenant autenticado.
 */
export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return apiError("Unauthorized", 401);

  const db = forTenant(ctx.tenantId);
  const surveys = await db.survey.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      slug: true,
      status: true,
      pageMode: true,
      opensAt: true,
      closesAt: true,
      createdAt: true,
    },
  });

  return Response.json({
    data: surveys.map((s) => ({
      ...s,
      url: `/p/${s.slug}`,
    })),
    total: surveys.length,
  });
}
