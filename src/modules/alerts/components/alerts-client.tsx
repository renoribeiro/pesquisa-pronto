"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Copy, TrendingDown } from "lucide-react";
import { acknowledgeAlert, suggestAlertResponse, runTrendCheck } from "@/modules/alerts/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Alert = {
  id: string;
  type: string;
  status: string;
  title: string;
  message: string;
  suggestedAction: string | null;
  createdAt: Date;
  survey: { title: string } | null;
};

const TYPE_LABELS: Record<string, string> = {
  DETRACTOR: "Detrator",
  NEGATIVE_TREND: "Tendência Negativa",
  EMERGING_THEME: "Tema Emergente",
  LOW_VOLUME: "Baixo Volume",
};

export function AlertsClient({
  alerts: initial,
  canManage = false,
}: {
  alerts: Alert[];
  canManage?: boolean;
}) {
  const [alerts, setAlerts] = useState(initial);
  const [, start] = useTransition();
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  // Nota: a re-sincronização após router.refresh() é garantida por uma `key`
  // derivada dos dados em alerts/page.tsx, que remonta este componente com a
  // prop fresca (em vez de sincronizar via useEffect/setState).

  function acknowledge(id: string) {
    start(async () => {
      try {
        await acknowledgeAlert(id);
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "ACKNOWLEDGED" } : a)),
        );
        toast.success("Alerta reconhecido.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro.");
      }
    });
  }

  function onSuggested(id: string, text: string) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, suggestedAction: text } : a)));
  }

  async function handleTrendCheck() {
    setChecking(true);
    try {
      const created = await runTrendCheck();
      toast.success(
        created > 0
          ? "Tendência negativa detectada — alerta criado."
          : "Nenhuma tendência negativa no momento.",
      );
      // Re-busca a lista no server component (page re-roda getAlerts) para
      // exibir o alerta recém-criado.
      if (created > 0) router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setChecking(false);
    }
  }

  const open = alerts.filter((a) => a.status === "OPEN");
  const closed = alerts.filter((a) => a.status !== "OPEN");

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleTrendCheck} disabled={checking} className="gap-2">
            <TrendingDown className={`h-4 w-4 ${checking ? "animate-pulse" : ""}`} />
            {checking ? "Verificando..." : "Verificar tendência"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Abertos ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta aberto.</p>
        ) : (
          <div className="divide-y rounded-md border border-destructive/30">
            {open.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                canManage={canManage}
                onAck={canManage ? () => acknowledge(a.id) : undefined}
                onSuggested={onSuggested}
              />
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Reconhecidos</h2>
          <div className="divide-y rounded-md border opacity-60">
            {closed.map((a) => (
              <AlertRow key={a.id} alert={a} canManage={false} onSuggested={onSuggested} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert: a,
  canManage,
  onAck,
  onSuggested,
}: {
  alert: Alert;
  canManage: boolean;
  onAck?: () => void;
  onSuggested: (id: string, text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const showCloseLoop = canManage && a.type === "DETRACTOR";

  async function generate() {
    setLoading(true);
    try {
      const text = await suggestAlertResponse(a.id);
      onSuggested(a.id, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar sugestão.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!a.suggestedAction) return;
    try {
      await navigator.clipboard.writeText(a.suggestedAction);
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={a.status === "OPEN" ? "destructive" : "secondary"}>
              {TYPE_LABELS[a.type] ?? a.type}
            </Badge>
            {a.survey && <span className="text-xs text-muted-foreground">{a.survey.title}</span>}
          </div>
          <p className="text-sm font-medium">{a.title}</p>
          <p className="text-xs text-muted-foreground">{a.message}</p>
          <p className="text-xs text-muted-foreground">
            {a.createdAt.toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {onAck && a.status === "OPEN" && (
            <Button variant="outline" size="sm" onClick={onAck}>
              Reconhecer
            </Button>
          )}
          {showCloseLoop && !a.suggestedAction && (
            <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-2">
              <Sparkles className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
              {loading ? "Gerando..." : "Sugerir resposta"}
            </Button>
          )}
        </div>
      </div>

      {a.suggestedAction && (
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#901A1E]">
              <Sparkles className="h-3.5 w-3.5 text-[#C5A059]" />
              Sugestão de resposta (close-loop)
            </span>
            <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1 px-2 text-xs">
              <Copy className="h-3 w-3" />
              Copiar
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3A3333]">{a.suggestedAction}</p>
        </div>
      )}
    </div>
  );
}
