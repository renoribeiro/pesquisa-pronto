"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { acknowledgeAlert } from "@/modules/alerts/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Alert = {
  id: string;
  type: string;
  status: string;
  title: string;
  message: string;
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

  const open = alerts.filter((a) => a.status === "OPEN");
  const closed = alerts.filter((a) => a.status !== "OPEN");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Abertos ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta aberto.</p>
        ) : (
          <div className="divide-y rounded-md border border-destructive/30">
            {open.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onAck={canManage ? () => acknowledge(a.id) : undefined}
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
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert: a,
  onAck,
}: {
  alert: Alert;
  onAck?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={a.status === "OPEN" ? "destructive" : "secondary"}>
            {TYPE_LABELS[a.type] ?? a.type}
          </Badge>
          {a.survey && (
            <span className="text-xs text-muted-foreground">{a.survey.title}</span>
          )}
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
      {onAck && a.status === "OPEN" && (
        <Button variant="outline" size="sm" onClick={onAck}>
          Reconhecer
        </Button>
      )}
    </div>
  );
}
