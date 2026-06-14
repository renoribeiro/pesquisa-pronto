"use client";

import { useState, useTransition } from "react";
import { Tags, RefreshCw, TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateTopicClusters, getTopicSamples } from "../actions";

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface TopicClusterView {
  id: string;
  label: string;
  volume: number;
  sentiment: Sentiment;
  trend: number;
}

interface Props {
  initialClusters: TopicClusterView[];
}

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  POSITIVE: "#2e7d52",
  NEGATIVE: "#901A1E",
  NEUTRAL: "#6E6565",
};

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[#901A1E]" title="Tendência de alta">
        <TrendingUp className="h-3 w-3" /> {trend}%
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[#2e7d52]" title="Tendência de queda">
        <TrendingDown className="h-3 w-3" /> {Math.abs(trend)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[#6E6565]" title="Estável">
      <Minus className="h-3 w-3" />
    </span>
  );
}

export function TopicClustersWidget({ initialClusters }: Props) {
  const [clusters, setClusters] = useState<TopicClusterView[]>(initialClusters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtro por tema: tema selecionado + comentários-amostra carregados sob demanda.
  const [selected, setSelected] = useState<TopicClusterView | null>(null);
  const [samples, setSamples] = useState<string[] | null>(null);
  const [loadingSamples, startSamples] = useTransition();

  const maxVolume = clusters.reduce((m, c) => Math.max(m, c.volume), 1);

  function selectTopic(c: TopicClusterView) {
    // Clicar no tema já selecionado limpa o filtro.
    if (selected?.id === c.id) {
      setSelected(null);
      setSamples(null);
      return;
    }
    setSelected(c);
    setSamples(null);
    startSamples(async () => {
      try {
        const result = await getTopicSamples(c.id);
        setSamples(result.samples);
      } catch {
        setSamples([]);
      }
    });
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSelected(null);
    setSamples(null);
    try {
      const result = await generateTopicClusters();
      setClusters(
        result.map((c) => ({
          id: c.id,
          label: c.label,
          volume: c.volume,
          sentiment: c.sentiment as Sentiment,
          trend: c.trend,
        })),
      );
    } catch (err) {
      console.error(err);
      setError(
        "Erro ao extrair temas. Verifique se há comentários analisados e se ANTHROPIC_API_KEY/OPENAI_API_KEY estão configuradas.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Tamanho de fonte proporcional ao volume (nuvem de palavras).
  function fontSize(volume: number): string {
    const min = 0.85;
    const max = 2.0;
    const size = min + (max - min) * (volume / maxVolume);
    return `${size.toFixed(2)}rem`;
  }

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
      <div className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
            <Tags className="h-5 w-5 text-[#C5A059]" />
            Temas Recorrentes
          </h2>
          <p className="text-[#6E6565] text-sm font-semibold">
            Agrupamento por IA dos comentários dos últimos 30 dias, com volume e tendência.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 gap-2 bg-background hover:bg-[#E0DADA] text-[#901A1E] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-10 px-4 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analisando..." : "Atualizar Temas"}
        </Button>
      </div>

      <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6 min-h-[120px]">
        {loading ? (
          <div className="flex flex-wrap gap-3 py-2 animate-pulse">
            {[5, 7, 4, 6, 3, 5].map((w, i) => (
              <div key={i} className="h-7 rounded-full bg-[#E0DADA] opacity-60" style={{ width: `${w}rem` }} />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-[#901A1E] font-semibold py-2">{error}</p>
        ) : clusters.length > 0 ? (
          <>
            {/* Nuvem de palavras (clique para filtrar por tema) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 leading-tight">
              {clusters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectTopic(c)}
                  className={`font-extrabold transition-transform hover:scale-105 cursor-pointer ${
                    selected && selected.id !== c.id ? "opacity-30" : ""
                  }`}
                  style={{ fontSize: fontSize(c.volume), color: SENTIMENT_COLOR[c.sentiment] }}
                  title={`${c.volume} menção(ões) · ${c.sentiment}`}
                  aria-pressed={selected?.id === c.id}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Lista detalhada (clicável) */}
            <div className="mt-6 space-y-2 border-t border-[#a8a0a0]/20 pt-4">
              {clusters.map((c) => (
                <button
                  key={`row-${c.id}`}
                  type="button"
                  onClick={() => selectTopic(c)}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-[#E0DADA]/40 ${
                    selected?.id === c.id ? "bg-[#E0DADA]/60" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 font-bold text-[#3A3333]">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: SENTIMENT_COLOR[c.sentiment] }}
                    />
                    {c.label}
                  </span>
                  <span className="flex items-center gap-4 text-xs font-semibold text-[#6E6565]">
                    <span>{c.volume} menç.</span>
                    <TrendBadge trend={c.trend} />
                  </span>
                </button>
              ))}
            </div>

            {/* Painel do tema selecionado: comentários-amostra */}
            {selected && (
              <div className="mt-6 rounded-2xl border-0 bg-background p-5 shadow-neumorphic-inset">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="flex items-center gap-2 font-extrabold text-[#901A1E]">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: SENTIMENT_COLOR[selected.sentiment] }}
                    />
                    {selected.label}
                    <span className="text-xs font-semibold text-[#6E6565]">
                      · {selected.volume} menç. · <TrendBadge trend={selected.trend} />
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => selectTopic(selected)}
                    className="text-[#6E6565] hover:text-[#901A1E]"
                    title="Limpar filtro"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {loadingSamples ? (
                    <p className="text-sm font-semibold text-[#6E6565]">Carregando comentários…</p>
                  ) : samples && samples.length > 0 ? (
                    samples.map((s, i) => (
                      <p
                        key={i}
                        className="border-l-2 border-[#C5A059] pl-3 text-sm text-[#3A3333] italic"
                      >
                        “{s}”
                      </p>
                    ))
                  ) : (
                    <p className="text-sm font-semibold text-[#6E6565]">
                      Sem comentários-amostra disponíveis para este tema.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-[#6E6565] font-semibold mb-4">
              Nenhum tema extraído ainda. Gere a partir dos comentários já analisados.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="gap-2 bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-10 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
            >
              <Tags className="h-4 w-4" />
              Extrair Temas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
