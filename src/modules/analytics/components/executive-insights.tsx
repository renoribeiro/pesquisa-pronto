"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAiSummary } from "../actions";

interface Props {
  initialSummary: {
    id: string;
    content: string;
    createdAt: Date;
    npsAvg: number | null;
  } | null;
}

export function ExecutiveInsightsWidget({ initialSummary }: Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateAiSummary();
      setSummary(result);
    } catch (err) {
      console.error(err);
      setError("Erro ao gerar novos insights. Certifique-se de que a ANTHROPIC_API_KEY está configurada.");
    } finally {
      setLoading(false);
    }
  }

  const paragraphs = summary?.content
    ? summary.content.split("\n\n").filter((p) => p.trim().length > 0)
    : [];

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
      {/* Dynamic Keyframe Styles */}
      <style>{`
        @keyframes subtleGlow {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(197, 160, 89, 0.3)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 8px rgba(197, 160, 89, 0.7)); transform: scale(1.1); }
        }
        .animate-subtle-glow {
          animation: subtleGlow 2s infinite ease-in-out;
        }
        @keyframes contentFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-content-fade-in {
          animation: contentFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Background glowing spot */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#901A1E]/5 blur-3xl pointer-events-none" />

      <div className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
            <Sparkles className="h-5 w-5 text-[#C5A059] animate-pulse" />
            Insights Narrados por IA
          </h2>
          <p className="text-[#6E6565] text-sm font-semibold">
            Resumo analítico automatizado com base nos comentários e notas de pacientes.
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={loading}
          className="shrink-0 gap-2 bg-background hover:bg-[#E0DADA] text-[#901A1E] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-10 px-4 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Processando..." : "Gerar Insights"}
        </Button>
      </div>

      <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6 min-h-[100px] transition-all duration-500">
        {loading ? (
          <div className="space-y-3 py-2 animate-pulse">
            <div className="h-4 w-3/4 rounded bg-[#E0DADA] opacity-60" />
            <div className="h-4 w-5/6 rounded bg-[#E0DADA] opacity-60" />
            <div className="h-4 w-2/3 rounded bg-[#E0DADA] opacity-60" />
            <div className="h-4 w-4/5 rounded bg-[#E0DADA] opacity-60" />
          </div>
        ) : error ? (
          <p className="text-sm text-[#901A1E] font-semibold py-2">{error}</p>
        ) : paragraphs.length > 0 ? (
          <div className="space-y-4 text-sm leading-relaxed text-[#3A3333] font-medium max-w-none animate-content-fade-in relative">
            {/* Subtle floating gold sparkle in the corner of content */}
            <div className="absolute top-0 right-0 h-6 w-6 rounded-full bg-[#C5A059]/10 flex items-center justify-center animate-subtle-glow">
              <Sparkles className="h-3 w-3 text-[#C5A059]" />
            </div>
            {paragraphs.map((p, i) => (
              <p key={i} className="pr-6 leading-relaxed">{p}</p>
            ))}
            {summary?.createdAt && (
              <p className="text-[10px] text-[#6E6565]/80 pt-3 border-t border-[#a8a0a0]/20">
                Gerado em {new Date(summary.createdAt).toLocaleDateString("pt-BR")} às{" "}
                {new Date(summary.createdAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-[#6E6565] font-semibold mb-4">
              Nenhum resumo executivo gerado para este tenant ainda.
            </p>
            <Button
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2 bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-10 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Gerar Primeiros Insights
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
