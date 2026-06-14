"use client";

import { useState } from "react";
import { LineChart, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateComparison } from "../actions";
import type { ComparativeData } from "@/modules/analytics/comparative";

function Delta({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  const diff = current - previous;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color = diff > 0 ? "text-[#2e7d52]" : diff < 0 ? "text-[#901A1E]" : "text-[#6E6565]";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${color}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : ""}
      {diff}
      {suffix}
    </span>
  );
}

function Metric({
  label,
  current,
  previous,
  suffix = "",
}: {
  label: string;
  current: number;
  previous: number;
  suffix?: string;
}) {
  return (
    <div className="shadow-neumorphic-inset rounded-2xl bg-background p-4">
      <p className="text-xs font-semibold text-[#6E6565]">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-[#3A3333]">
          {current}
          {suffix}
        </span>
        <Delta current={current} previous={previous} suffix={suffix} />
      </div>
      <p className="mt-0.5 text-[11px] text-[#6E6565]">
        anterior: {previous}
        {suffix}
      </p>
    </div>
  );
}

export function ComparativeInsightsWidget() {
  const [data, setData] = useState<ComparativeData | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateComparison();
      setData(result.data);
      setNarrative(result.narrative);
    } catch (err) {
      console.error(err);
      setError(
        "Erro ao gerar a análise comparativa. Verifique se há respostas e se ANTHROPIC_API_KEY está configurada.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-0 bg-background p-8 shadow-neumorphic sm:p-10">
      <div className="flex flex-col justify-between gap-6 pb-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
            <LineChart className="h-5 w-5 text-[#C5A059]" />
            Análise comparativa
          </h2>
          <p className="text-sm font-semibold text-[#6E6565]">
            Compara os últimos 30 dias com os 30 dias anteriores — variações de NPS, volume e
            sentimento, com narrativa por IA.
          </p>
        </div>
        <Button
          onClick={run}
          disabled={loading}
          className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-2xl border-0 bg-background px-4 font-bold text-[#901A1E] shadow-neumorphic transition-all duration-300 hover:bg-[#E0DADA] hover:shadow-neumorphic-hover active:translate-y-[0.5px] active:shadow-neumorphic-inset disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analisando..." : data ? "Atualizar" : "Gerar análise"}
        </Button>
      </div>

      {error && <p className="py-2 text-sm font-semibold text-[#901A1E]">{error}</p>}

      {data && (
        <div className="mt-4 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="NPS" current={data.current.nps} previous={data.previous.nps} />
            <Metric label="Respostas" current={data.current.total} previous={data.previous.total} />
            <Metric
              label="Sentimento positivo"
              current={data.current.positive}
              previous={data.previous.positive}
            />
            <Metric
              label="Sentimento negativo"
              current={data.current.negative}
              previous={data.previous.negative}
            />
          </div>

          {narrative && (
            <div className="shadow-neumorphic-inset rounded-2xl bg-background p-6">
              {narrative.split("\n").filter((p) => p.trim()).map((p, i) => (
                <p key={i} className="mb-2 text-sm leading-relaxed text-[#3A3333] last:mb-0">
                  {p}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
