import { DollarSign, Cpu, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { AiCostSummary } from "../ai-cost";

interface Props {
  summary: AiCostSummary;
}

const numberFmt = new Intl.NumberFormat("pt-BR");

function formatUsd(value: number): string {
  return `US$ ${value.toLocaleString("en-US", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: 4,
  })}`;
}

function formatJobType(jobType: string): string {
  return jobType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AiCostWidget({ summary }: Props) {
  const hasData = summary.byJobType.length > 0;
  const maxCost = summary.byJobType.reduce((m, b) => Math.max(m, b.costUsd), 0);

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#C5A059]/5 blur-3xl pointer-events-none" />

      <div className="pb-3 space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
          <DollarSign className="h-5 w-5 text-[#C5A059]" />
          Custo de IA (últimos {summary.sinceDays} dias)
        </h2>
        <p className="text-[#6E6565] text-sm font-semibold">
          Consumo registrado das chamadas de IA do tenant, com quebra por tipo de job.
        </p>
      </div>

      {hasData ? (
        <>
          {/* Destaques */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="shadow-neumorphic-inset bg-background p-5 rounded-2xl border-0">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6E6565]">Custo total</p>
              <p className="mt-2 text-3xl font-extrabold text-[#901A1E] leading-none">
                {formatUsd(summary.totalCostUsd)}
              </p>
            </div>
            <div className="shadow-neumorphic-inset bg-background p-5 rounded-2xl border-0">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#6E6565]">
                <ArrowDownToLine className="h-3.5 w-3.5 text-[#C5A059]" />
                Tokens de entrada
              </p>
              <p className="mt-2 text-2xl font-extrabold text-[#3A3333] leading-none">
                {numberFmt.format(summary.totalInputTokens)}
              </p>
            </div>
            <div className="shadow-neumorphic-inset bg-background p-5 rounded-2xl border-0">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#6E6565]">
                <ArrowUpFromLine className="h-3.5 w-3.5 text-[#C5A059]" />
                Tokens de saída
              </p>
              <p className="mt-2 text-2xl font-extrabold text-[#3A3333] leading-none">
                {numberFmt.format(summary.totalOutputTokens)}
              </p>
            </div>
          </div>

          {/* Breakdown por jobType */}
          <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#3A3333] mb-4">
              <Cpu className="h-4 w-4 text-[#C5A059]" />
              Custo por tipo de job
            </h3>
            <div className="space-y-3">
              {summary.byJobType.map((b) => (
                <div key={b.jobType} className="space-y-1">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-bold text-[#3A3333]">{formatJobType(b.jobType)}</span>
                    <span className="flex items-center gap-4 text-xs font-semibold text-[#6E6565]">
                      <span>
                        {b.calls} chamada{b.calls === 1 ? "" : "s"}
                      </span>
                      <span className="font-extrabold text-[#901A1E]">{formatUsd(b.costUsd)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#E0DADA] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#C5A059]"
                      style={{ width: `${maxCost > 0 ? (b.costUsd / maxCost) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6 min-h-[120px] flex flex-col items-center justify-center text-center">
          <DollarSign className="h-8 w-8 text-[#C5A059]/60 mb-3" />
          <p className="text-sm text-[#6E6565] font-semibold">
            Nenhum consumo de IA registrado nos últimos {summary.sinceDays} dias.
          </p>
          <p className="text-xs text-[#6E6565]/80 mt-1">
            Os custos aparecerão aqui assim que análises de IA forem executadas.
          </p>
        </div>
      )}
    </div>
  );
}
