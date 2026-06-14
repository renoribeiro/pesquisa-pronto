"use client";

import { useState, useTransition } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { exportAuditCsv, type AuditLogEntry } from "@/modules/audit/actions";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Fortaleza",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

function formatDetails(metadata: unknown): string {
  if (metadata === null || metadata === undefined || metadata === "") return "—";
  if (typeof metadata === "string") return metadata;
  try {
    return JSON.stringify(metadata);
  } catch {
    return String(metadata);
  }
}

export function AuditClient({ entries }: { entries: AuditLogEntry[] }) {
  const [pending, start] = useTransition();
  const [rows] = useState<AuditLogEntry[]>(entries);

  function onExport() {
    start(async () => {
      try {
        const csv = await exportAuditCsv();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        a.download = `auditoria-${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("CSV exportado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao exportar.");
      }
    });
  }

  return (
    <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-6 sm:p-8 border-0">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#C5A059]/5 blur-3xl pointer-events-none" />

      <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
            <ShieldCheck className="h-5 w-5 text-[#C5A059]" />
            Trilha de auditoria
          </h2>
          <p className="text-[#6E6565] text-sm font-semibold">
            Últimas {rows.length} ações registradas no tenant.
          </p>
        </div>

        <button
          type="button"
          onClick={onExport}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2 text-sm font-bold text-[#901A1E] shadow-neumorphic transition active:shadow-neumorphic-inset disabled:opacity-60"
        >
          <Download className="h-4 w-4 text-[#C5A059]" />
          {pending ? "Exportando…" : "Exportar CSV"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm font-semibold text-[#6E6565]">
          Nenhum registro de auditoria ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl shadow-neumorphic-inset">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6E6565]">
                <th className="px-4 py-3 font-bold">Data</th>
                <th className="px-4 py-3 font-bold">Usuário</th>
                <th className="px-4 py-3 font-bold">Ação</th>
                <th className="px-4 py-3 font-bold">Entidade</th>
                <th className="px-4 py-3 font-bold">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t border-black/5 align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#3A3636]">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-[#3A3636]">
                    {entry.userName ?? entry.userEmail ?? (
                      <span className="text-[#6E6565]">sistema</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-lg bg-[#901A1E]/5 px-2 py-1 font-mono text-xs font-bold text-[#901A1E]">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#3A3636]">
                    {[entry.entity, entry.entityId].filter(Boolean).join(":") || "—"}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-[#6E6565]" title={formatDetails(entry.metadata)}>
                    {formatDetails(entry.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
