import { requirePermission, responseSectorWhere, surveySectorWhere } from "@/lib/session";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Respostas — Pronto Satisfação" };

const CHANNEL_LABELS: Record<string, string> = {
  LINK: "Link",
  QR_CODE: "QR Code",
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMBED: "Embed",
};

export default async function ResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; survey?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const { ctx, db, scope } = await requirePermission("survey:view");
  const respSector = responseSectorWhere(ctx, scope);
  const surveySector = surveySectorWhere(ctx, scope);
  const responseWhere = { completed: true, ...(sp.survey ? { surveyId: sp.survey } : {}), ...respSector };

  const [responses, total, surveys] = await Promise.all([
    db.response.findMany({
      where: responseWhere,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        survey: { select: { title: true } },
        aiAnalysis: { select: { sentiment: true } },
      },
    }),
    db.response.count({ where: responseWhere }),
    db.survey.findMany({
      where: surveySector,
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Respostas</h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      {/* Filter */}
      <form className="flex gap-2">
        <select
          name="survey"
          defaultValue={sp.survey ?? ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Todas as pesquisas</option>
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md border bg-background px-3 text-sm hover:bg-muted"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Pesquisa</th>
              <th className="px-4 py-3 text-left font-medium">Data</th>
              <th className="px-4 py-3 text-left font-medium">Canal</th>
              <th className="px-4 py-3 text-left font-medium">Dispositivo</th>
              <th className="px-4 py-3 text-left font-medium">NPS</th>
              <th className="px-4 py-3 text-left font-medium">Sentimento</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {responses.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">{r.survey.title}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.createdAt.toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3">{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.deviceType ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.npsScore !== null ? (
                    <Badge
                      variant="outline"
                      className={
                        r.npsScore >= 9
                          ? "border-green-500 text-green-600"
                          : r.npsScore >= 7
                            ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                      }
                    >
                      {r.npsScore}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.aiAnalysis ? (
                    <span
                      className={
                        r.aiAnalysis.sentiment === "POSITIVE"
                          ? "text-green-600"
                          : r.aiAnalysis.sentiment === "NEGATIVE"
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }
                    >
                      {r.aiAnalysis.sentiment === "POSITIVE"
                        ? "Positivo"
                        : r.aiAnalysis.sentiment === "NEGATIVE"
                          ? "Negativo"
                          : "Neutro"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {responses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma resposta encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <a
              href={`/admin/responses?page=${page - 1}${sp.survey ? `&survey=${sp.survey}` : ""}`}
              className="h-9 rounded-md border bg-background px-3 text-sm leading-9 hover:bg-muted"
            >
              ← Anterior
            </a>
          )}
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/admin/responses?page=${page + 1}${sp.survey ? `&survey=${sp.survey}` : ""}`}
              className="h-9 rounded-md border bg-background px-3 text-sm leading-9 hover:bg-muted"
            >
              Próxima →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
