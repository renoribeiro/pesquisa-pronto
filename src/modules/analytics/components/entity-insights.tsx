import { Users, Stethoscope, Building2, Activity, Tag } from "lucide-react";
import type { EntityInsight } from "../entities";

interface Props {
  initialEntities: EntityInsight[];
}

interface TypeMeta {
  label: string;
  Icon: typeof Users;
}

function typeMeta(type: string): TypeMeta {
  const t = type.toLowerCase();
  if (t.includes("medic") || t.includes("doctor") || t.includes("profission")) {
    return { label: "Médico", Icon: Stethoscope };
  }
  if (t.includes("setor") || t.includes("sector") || t.includes("depart")) {
    return { label: "Setor", Icon: Building2 };
  }
  if (t.includes("proced") || t.includes("exame") || t.includes("treatment")) {
    return { label: "Procedimento", Icon: Activity };
  }
  return { label: type, Icon: Tag };
}

/** Cor pela NOTA média (0-10), alinhada aos cortes promotor/passivo/detrator. */
function scoreColor(avgScore: number | null): string {
  if (avgScore === null) return "#6E6565";
  if (avgScore >= 9) return "#2e7d52"; // promotores
  if (avgScore >= 7) return "#C5A059"; // passivos
  return "#901A1E"; // detratores
}

export function EntityInsightsWidget({ initialEntities }: Props) {
  const entities = initialEntities;

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
      <div className="pb-3 space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
          <Users className="h-5 w-5 text-[#C5A059]" />
          Entidades mencionadas
        </h2>
        <p className="text-[#6E6565] text-sm font-semibold">
          Médicos, setores e procedimentos citados nas análises mais recentes, com a nota média e o sentimento.
        </p>
      </div>

      <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6 min-h-[120px]">
        {entities.length > 0 ? (
          <div className="space-y-2">
            {entities.map((e) => {
              const meta = typeMeta(e.type);
              const { Icon } = meta;
              const color = scoreColor(e.avgScore);
              return (
                <div
                  key={`${e.type}|${e.name.toLowerCase()}`}
                  className="flex items-center justify-between gap-4 border-b border-[#a8a0a0]/15 pb-2 last:border-0 last:pb-0"
                >
                  <span className="flex min-w-0 items-center gap-2 font-bold text-[#3A3333]">
                    <span className="truncate">{e.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EBE6E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6E6565] shadow-neumorphic-inset">
                      <Icon className="h-3 w-3 text-[#C5A059]" />
                      {meta.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-4 text-xs font-semibold">
                    <span className="text-[#6E6565]" title="Menções">
                      {e.mentions} menç.
                    </span>
                    <span
                      className="tabular-nums font-extrabold"
                      style={{ color }}
                      title="Nota média (0-10)"
                    >
                      {e.avgScore === null ? "—" : `Nota ${e.avgScore.toFixed(1)}`}
                    </span>
                    <span
                      className={e.negativeRate > 0 ? "text-[#901A1E]" : "text-[#6E6565]"}
                      title="Menções em respostas com sentimento negativo"
                    >
                      {Math.round(e.negativeRate * 100)}% neg.
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-[#6E6565] font-semibold">
              Nenhuma entidade identificada ainda. Assim que os comentários forem analisados pela
              IA, médicos, setores e procedimentos citados aparecerão aqui com o NPS associado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
