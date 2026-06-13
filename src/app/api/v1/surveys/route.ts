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
  const now = new Date();

  // "Disponível" = publicada E dentro da janela opensAt/closesAt.
  // Uma pesquisa publicada mas agendada para o futuro (opensAt > now) ou já
  // encerrada (closesAt < now) NÃO deve ser tratada como disponível.
  const surveys = await db.survey.findMany({
    where: {
      status: "PUBLISHED",
      AND: [
        { OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
        { OR: [{ closesAt: null }, { closesAt: { gte: now } }] },
      ],
    },
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
      // Estado explícito: dentro da janela ⇒ "available".
      available: true,
      url: `/p/${encodeURIComponent(s.slug)}`,
    })),
    total: surveys.length,
  });
}
