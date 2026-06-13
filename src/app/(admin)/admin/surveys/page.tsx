import Link from "next/link";
import { requirePermission, surveySectorWhere } from "@/lib/session";
import { can } from "@/lib/rbac";
import { NewSurveyButton } from "@/modules/surveys/components/new-survey-button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pesquisas — Pronto Satisfação" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  CLOSED: "Encerrada",
  ARCHIVED: "Arquivada",
};

export default async function SurveysPage() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  const surveys = await db.survey.findMany({
    where: surveySectorWhere(ctx, scope),
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { responses: true, questions: true } } },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#3A3333]">Pesquisas</h1>
          <p className="text-[#6E6565] text-sm font-semibold mt-1">Gerencie e acompanhe os formulários da Prontoclínica.</p>
        </div>
        {can(ctx.role, "survey:create") ? <NewSurveyButton /> : null}
      </div>

      {/* Table Headers - High Visibility & Separation */}
      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-[#6E6565]/95 bg-[#E0DADA]/40 rounded-2xl border-0 shadow-sm">
        <div className="col-span-5">Título da Pesquisa</div>
        <div className="col-span-2 text-center">Status</div>
        <div className="col-span-2 text-center">Perguntas</div>
        <div className="col-span-2 text-center">Respostas</div>
        <div className="col-span-1 text-right">Ações</div>
      </div>

      {/* Survey Rows as distinct Neumorphic Card Strips */}
      <div className="space-y-4">
        {surveys.map((s) => (
          <div 
            key={s.id}
            className="bg-[#EBE6E6] shadow-neumorphic rounded-xl p-5 md:p-6 border-0 hover:-translate-y-[2px] hover:shadow-neumorphic-hover transition-all duration-300 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
          >
            {/* Title */}
            <div className="col-span-1 md:col-span-5 space-y-1">
              <span className="text-[10px] md:hidden font-bold uppercase tracking-wider text-[#6E6565]">Título:</span>
              <div>
                <Link 
                  className="text-base font-extrabold text-[#3A3333] hover:text-[#901A1E] transition-colors leading-snug" 
                  href={`/admin/surveys/${s.id}`}
                >
                  {s.title}
                </Link>
              </div>
            </div>

            {/* Status */}
            <div className="col-span-1 md:col-span-2 flex md:justify-center items-center">
              <span className="text-[10px] md:hidden font-bold uppercase tracking-wider text-[#6E6565] mr-2">Status:</span>
              <Badge 
                variant={s.status === "PUBLISHED" ? "default" : "secondary"}
                className={cn(
                  "font-bold text-xs px-3 py-1 rounded-full border-0",
                  s.status === "PUBLISHED" 
                    ? "bg-[#901A1E] text-white" 
                    : "bg-[#EBE6E6] shadow-neumorphic-inset text-[#6E6565]"
                )}
              >
                {STATUS_LABELS[s.status] ?? s.status}
              </Badge>
            </div>

            {/* Questions count */}
            <div className="col-span-1 md:col-span-2 flex md:justify-center items-center">
              <span className="text-[10px] md:hidden font-bold uppercase tracking-wider text-[#6E6565] mr-2">Perguntas:</span>
              <span className="text-sm font-extrabold text-[#3A3333] bg-[#EBE6E6] shadow-neumorphic-inset h-8 w-12 rounded-xl flex items-center justify-center">
                {s._count.questions}
              </span>
            </div>

            {/* Responses count */}
            <div className="col-span-1 md:col-span-2 flex md:justify-center items-center">
              <span className="text-[10px] md:hidden font-bold uppercase tracking-wider text-[#6E6565] mr-2">Respostas:</span>
              <span className="text-sm font-extrabold text-[#901A1E] bg-[#EBE6E6] shadow-neumorphic-inset h-8 w-12 rounded-xl flex items-center justify-center">
                {s._count.responses}
              </span>
            </div>

            {/* Actions (Edit Icon) */}
            <div className="col-span-1 md:col-span-1 flex md:justify-end items-center">
              <span className="text-[10px] md:hidden font-bold uppercase tracking-wider text-[#6E6565] mr-2">Ações:</span>
              <Link 
                href={`/admin/surveys/${s.id}`}
                className="h-9 w-9 rounded-xl bg-[#EBE6E6] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset flex items-center justify-center text-[#901A1E] hover:text-[#a12428] transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:outline-none"
                aria-label={`Editar pesquisa ${s.title}`}
              >
                <Pencil className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ))}

        {surveys.length === 0 ? (
          <div className="bg-[#EBE6E6] shadow-neumorphic-inset rounded-xl p-8 text-center text-[#6E6565] font-semibold">
            Nenhuma pesquisa cadastrada ainda.
          </div>
        ) : null}
      </div>
    </div>
  );
}
