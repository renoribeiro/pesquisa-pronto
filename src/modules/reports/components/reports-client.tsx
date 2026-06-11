"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createReport } from "@/modules/reports/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Report = {
  id: string;
  type: string;
  format: string;
  status: string;
  fileUrl: string | null;
  createdAt: Date;
  generatedBy: { name: string | null } | null;
};

const REPORT_TYPES = [
  { value: "RESPONSES_RAW", label: "Respostas brutas" },
  { value: "NPS_EVOLUTION", label: "Evolução NPS" },
  { value: "CSAT_SUMMARY", label: "Resumo CSAT" },
  { value: "SECTOR_COMPARISON", label: "Comparação por setor" },
  { value: "TOUCHPOINT_ANALYSIS", label: "Análise por ponto de contato" },
  { value: "AI_INSIGHTS", label: "Insights de IA" },
  { value: "FULL_REPORT", label: "Relatório completo" },
];

const FORMAT_OPTIONS = [
  { value: "EXCEL", label: "Excel (.xlsx)" },
  { value: "PDF", label: "PDF" },
  { value: "CSV", label: "CSV" },
];

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  generating: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function ReportsClient({ reports: initialReports }: { reports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const [type, setType] = useState("RESPONSES_RAW");
  const [format, setFormat] = useState("EXCEL");
  const [pending, start] = useTransition();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await createReport({ type, format });
        toast.success("Relatório criado. Será gerado em breve.");
        // Optimistic update
        setReports((prev) => [
          {
            id: crypto.randomUUID(),
            type,
            format,
            status: "pending",
            fileUrl: null,
            createdAt: new Date(),
            generatedBy: null,
          },
          ...prev,
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar relatório.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar novo relatório</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipo</label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Formato</label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Gerando..." : "Gerar relatório"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Relatórios gerados</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {REPORT_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                    <span className="ml-2 text-xs text-muted-foreground">{r.format}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {r.generatedBy?.name ? ` · ${r.generatedBy.name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[r.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {r.status}
                  </span>
                  {r.fileUrl && r.status === "ready" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={r.fileUrl} download target="_blank" rel="noreferrer" />}
                    >
                      Baixar
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
