"use client";

import { useState } from "react";
import { MessageCircleQuestion, Send, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askData } from "../actions";

interface Source {
  responseId: string;
  text: string;
}

export function AskDataWidget() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await askData(q);
      setAnswer(result.answer);
      setSources(result.sources ?? []);
    } catch (err) {
      console.error(err);
      setAnswer(null);
      setSources([]);
      setError(
        "Erro ao consultar seus dados. Verifique se há comentários analisados e se as chaves ANTHROPIC_API_KEY/OPENAI_API_KEY estão configuradas.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleAsk();
    }
  }

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
      <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-[#C5A059]/5 blur-3xl pointer-events-none" />

      <div className="pb-3 space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
          <MessageCircleQuestion className="h-5 w-5 text-[#C5A059]" />
          Pergunte aos seus dados
        </h2>
        <p className="text-[#6E6565] text-sm font-semibold">
          Faça uma pergunta em linguagem natural. A IA responde com base nos comentários dos pacientes.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="shadow-neumorphic-inset bg-background rounded-2xl border-0 p-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={3}
            placeholder="Ex.: Quais são as principais reclamações sobre o tempo de espera?"
            className="w-full resize-none bg-transparent px-3 py-2 text-sm font-medium text-[#3A3333] placeholder:text-[#6E6565]/60 focus:outline-none disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] text-[#6E6565]/70 font-semibold">
            Dica: Ctrl/Cmd + Enter para enviar.
          </span>
          <Button
            onClick={handleAsk}
            disabled={loading || question.trim().length === 0}
            className="shrink-0 gap-2 bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-10 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
          >
            <Send className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
            {loading ? "Consultando..." : "Perguntar"}
          </Button>
        </div>

        <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 min-h-[100px]">
          {loading ? (
            <div className="space-y-3 py-2 animate-pulse">
              <div className="h-4 w-3/4 rounded bg-[#E0DADA] opacity-60" />
              <div className="h-4 w-5/6 rounded bg-[#E0DADA] opacity-60" />
              <div className="h-4 w-2/3 rounded bg-[#E0DADA] opacity-60" />
            </div>
          ) : error ? (
            <p className="text-sm text-[#901A1E] font-semibold py-2">{error}</p>
          ) : answer ? (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed text-[#3A3333] font-medium whitespace-pre-wrap">
                {answer}
              </p>

              {sources.length > 0 && (
                <div className="space-y-2 border-t border-[#a8a0a0]/20 pt-4">
                  <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#6E6565]">
                    <Quote className="h-3.5 w-3.5 text-[#C5A059]" />
                    Fontes ({sources.length})
                  </h3>
                  <ul className="space-y-2">
                    {sources.map((s, i) => (
                      <li
                        key={`${s.responseId}-${i}`}
                        className="flex gap-3 rounded-2xl bg-background shadow-neumorphic px-4 py-3 text-sm"
                      >
                        <span className="shrink-0 font-extrabold text-[#901A1E]">[{i + 1}]</span>
                        <span className="text-[#3A3333] font-medium leading-relaxed">{s.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-sm text-[#6E6565] font-semibold">
                Digite uma pergunta acima e clique em Perguntar para começar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
