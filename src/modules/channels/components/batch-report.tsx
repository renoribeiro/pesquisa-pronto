"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { listDispatchBatches, type BatchReportItem } from "@/modules/channels/batch-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  LINK: "Link",
  QR: "QR",
  EMBED: "Embed",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function BatchReport({
  surveyId,
  initial,
}: {
  surveyId: string;
  initial: BatchReportItem[];
}) {
  const [batches, setBatches] = useState(initial);
  const [refreshing, start] = useTransition();

  function refresh() {
    start(async () => {
      try {
        setBatches(await listDispatchBatches(surveyId));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Histórico de disparos em lote</CardTitle>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Atualizando…" : "Atualizar"}
        </Button>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lote disparado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Falhas</TableHead>
                <TableHead>Agendado</TableHead>
                <TableHead>Por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const pending = b.total - b.sent - b.failed;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">{fmt(b.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{CHANNEL_LABELS[b.channel] ?? b.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{b.total}</TableCell>
                    <TableCell className="text-right text-emerald-600">{b.sent}</TableCell>
                    <TableCell className="text-right">
                      {b.failed > 0 ? (
                        <span className="text-destructive">{b.failed}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.scheduledAt ? (
                        fmt(b.scheduledAt)
                      ) : (
                        <span className="text-muted-foreground">imediato</span>
                      )}
                      {pending > 0 && (
                        <span className="ml-1 text-muted-foreground">({pending} na fila)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.createdBy ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
