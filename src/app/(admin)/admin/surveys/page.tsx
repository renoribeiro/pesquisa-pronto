import Link from "next/link";
import { requireSession } from "@/lib/session";
import { forTenant } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { NewSurveyButton } from "@/modules/surveys/components/new-survey-button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Pesquisas — Pronto Satisfação" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  CLOSED: "Encerrada",
  ARCHIVED: "Arquivada",
};

export default async function SurveysPage() {
  const ctx = await requireSession();
  const db = forTenant(ctx.tenantId);
  const surveys = await db.survey.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { responses: true, questions: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pesquisas</h1>
        {can(ctx.role, "survey:create") ? <NewSurveyButton /> : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Perguntas</TableHead>
            <TableHead className="text-right">Respostas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {surveys.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link className="font-medium hover:underline" href={`/admin/surveys/${s.id}`}>
                  {s.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={s.status === "PUBLISHED" ? "default" : "secondary"}>
                  {STATUS_LABELS[s.status] ?? s.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{s._count.questions}</TableCell>
              <TableCell className="text-right">{s._count.responses}</TableCell>
            </TableRow>
          ))}
          {surveys.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Nenhuma pesquisa ainda.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
