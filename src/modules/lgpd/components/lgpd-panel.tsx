"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, ShieldCheck, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPatientData, deletePatientData, runRetentionNow } from "../actions";

export function LgpdPanel() {
  const [email, setEmail] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);
  const [retentionCount, setRetentionCount] = useState<number | null>(null);

  function validEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function handleExport() {
    const value = email.trim();
    if (!validEmail(value)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setExporting(true);
    try {
      const data = await exportPatientData(value);
      if (data.recipients.length === 0) {
        toast.warning("Nenhum dado encontrado para este e-mail.");
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dados-titular-${value.replace(/[^a-z0-9]+/gi, "_")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Dados exportados (${data.recipients.length} registro(s)).`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao exportar dados do titular.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    const value = email.trim();
    if (!validEmail(value)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    const ok = window.confirm(
      `Confirma a exclusão dos dados do titular "${value}"?\n\nAs respostas serão anonimizadas (desvinculadas) e o cadastro removido. Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await deletePatientData(value);
      if (res.recipients === 0) {
        toast.warning("Nenhum cadastro encontrado para este e-mail.");
        return;
      }
      toast.success(
        `Excluído: ${res.recipients} cadastro(s), ${res.responses} resposta(s) anonimizada(s).`,
      );
      setEmail("");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao excluir dados do titular.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRunRetention() {
    setRunning(true);
    try {
      const res = await runRetentionNow();
      setRetentionCount(res.count);
      toast.success(
        `Retenção executada (${res.retentionMonths} meses): ${res.count} resposta(s) anonimizada(s).`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao executar a rotina de retenção.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Direitos do titular */}
      <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
        <div className="space-y-1 pb-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
            <ShieldCheck className="h-5 w-5 text-[#C5A059]" />
            Direitos do titular
          </h2>
          <p className="text-[#6E6565] text-sm font-semibold">
            Exporte ou exclua os dados pessoais de um titular pelo e-mail (LGPD — acesso,
            portabilidade e eliminação).
          </p>
        </div>

        <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-[#6E6565] uppercase tracking-wide">
              E-mail do titular
            </span>
            <div className="mt-2 flex items-center gap-2 bg-background shadow-neumorphic-inset rounded-2xl px-4 h-12">
              <Mail className="h-4 w-4 text-[#C5A059] shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="titular@exemplo.com"
                autoComplete="off"
                className="w-full bg-transparent outline-none text-sm font-semibold text-[#3A3333] placeholder:text-[#a8a0a0]"
              />
            </div>
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleExport}
              disabled={exporting || deleting}
              className="gap-2 bg-background hover:bg-[#E0DADA] text-[#901A1E] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
            >
              <Download className={`h-4 w-4 ${exporting ? "animate-pulse" : ""}`} />
              {exporting ? "Exportando..." : "Exportar dados"}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={exporting || deleting}
              className="gap-2 bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Excluindo..." : "Excluir dados"}
            </Button>
          </div>
        </div>
      </div>

      {/* Retenção / anonimização */}
      <div className="relative overflow-hidden bg-background shadow-neumorphic rounded-2xl p-8 sm:p-10 border-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#901A1E]">
              <RefreshCw className="h-5 w-5 text-[#C5A059]" />
              Retenção e anonimização
            </h2>
            <p className="text-[#6E6565] text-sm font-semibold">
              Anonimiza respostas cujo período de retenção configurado expirou, preservando os
              dados agregados (NPS e respostas).
            </p>
          </div>
          <Button
            onClick={handleRunRetention}
            disabled={running}
            className="shrink-0 gap-2 bg-background hover:bg-[#E0DADA] text-[#901A1E] shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 px-5 font-bold transition-all duration-300 flex items-center cursor-pointer active:translate-y-[0.5px] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Executando..." : "Rodar retenção agora"}
          </Button>
        </div>

        {retentionCount !== null && (
          <div className="shadow-neumorphic-inset bg-background p-6 rounded-2xl border-0 mt-6">
            <p className="text-sm font-bold text-[#3A3333]">
              Última execução:{" "}
              <span className="text-[#901A1E]">
                {retentionCount} resposta(s) anonimizada(s)
              </span>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
