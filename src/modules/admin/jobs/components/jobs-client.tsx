"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, RotateCw, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  retryFailedJob,
  removeFailedJob,
  retryAllFailed,
  type JobsOverview,
  type FailedJobView,
} from "@/modules/admin/jobs/actions";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Fortaleza",
});

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

function shortData(data: unknown): string {
  if (data === null || data === undefined) return "—";
  try {
    const s = typeof data === "string" ? data : JSON.stringify(data);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  } catch {
    return String(data);
  }
}

export function JobsClient({ overview }: { overview: JobsOverview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { metrics, failed } = overview;

  function run(fn: () => Promise<unknown>, success: string) {
    start(async () => {
      try {
        await fn();
        toast.success(success);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro na operação.");
      }
    });
  }

  const totalFailed = metrics.reduce((s, m) => s + m.counts.failed, 0);

  return (
    <div className="space-y-6">
      {/* Profundidade das filas */}
      <div className="relative overflow-hidden rounded-2xl border-0 bg-background p-6 shadow-neumorphic sm:p-8">
        <h2 className="flex items-center gap-2 pb-5 text-xl font-extrabold text-[#901A1E]">
          <Layers className="h-5 w-5 text-[#C5A059]" />
          Filas (profundidade)
        </h2>
        <div className="overflow-x-auto rounded-xl shadow-neumorphic-inset">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6E6565]">
                <th className="px-4 py-3 font-bold">Fila</th>
                <th className="px-4 py-3 font-bold">Espera</th>
                <th className="px-4 py-3 font-bold">Ativos</th>
                <th className="px-4 py-3 font-bold">Atrasados</th>
                <th className="px-4 py-3 font-bold">Falhos</th>
                <th className="px-4 py-3 font-bold">Concluídos</th>
                <th className="px-4 py-3 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.name} className="border-t border-black/5">
                  <td className="px-4 py-3 font-mono font-bold text-[#3A3636]">{m.name}</td>
                  <td className="px-4 py-3 text-[#3A3636]">{m.counts.waiting}</td>
                  <td className="px-4 py-3 text-[#3A3636]">{m.counts.active}</td>
                  <td className="px-4 py-3 text-[#3A3636]">{m.counts.delayed}</td>
                  <td className={`px-4 py-3 font-bold ${m.counts.failed > 0 ? "text-[#901A1E]" : "text-[#3A3636]"}`}>
                    {m.counts.failed}
                  </td>
                  <td className="px-4 py-3 text-[#6E6565]">{m.counts.completed}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending || m.counts.failed === 0}
                      onClick={() => run(() => retryAllFailed(m.name), `Reenfileirados os falhos de ${m.name}.`)}
                      className="inline-flex items-center gap-1 rounded-lg bg-background px-3 py-1.5 text-xs font-bold text-[#901A1E] shadow-neumorphic transition active:shadow-neumorphic-inset disabled:opacity-40"
                    >
                      <RotateCw className="h-3.5 w-3.5 text-[#C5A059]" />
                      Reprocessar todos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DLQ — jobs falhos */}
      <div className="relative overflow-hidden rounded-2xl border-0 bg-background p-6 shadow-neumorphic sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-[#901A1E]">Jobs falhos (DLQ)</h2>
            <p className="text-sm font-semibold text-[#6E6565]">
              {totalFailed} job(s) falho(s). Reprocesse após corrigir a causa, ou descarte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-background px-4 py-2 text-sm font-bold text-[#901A1E] shadow-neumorphic transition active:shadow-neumorphic-inset disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4 text-[#C5A059]" />
            Atualizar
          </button>
        </div>

        {failed.length === 0 ? (
          <p className="py-12 text-center text-sm font-semibold text-[#6E6565]">
            Nenhum job falho. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl shadow-neumorphic-inset">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6E6565]">
                  <th className="px-4 py-3 font-bold">Fila</th>
                  <th className="px-4 py-3 font-bold">Job</th>
                  <th className="px-4 py-3 font-bold">Tentativas</th>
                  <th className="px-4 py-3 font-bold">Falhou em</th>
                  <th className="px-4 py-3 font-bold">Motivo</th>
                  <th className="px-4 py-3 font-bold">Dados</th>
                  <th className="px-4 py-3 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((j: FailedJobView) => (
                  <tr key={`${j.queue}:${j.id}`} className="border-t border-black/5 align-top">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#901A1E]">{j.queue}</td>
                    <td className="px-4 py-3 font-semibold text-[#3A3636]">
                      {j.name}
                      <span className="ml-1 font-mono text-xs text-[#6E6565]">#{j.id}</span>
                    </td>
                    <td className="px-4 py-3 text-[#3A3636]">{j.attemptsMade}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#6E6565]">{fmt(j.failedAt)}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-[#6E6565]" title={j.failedReason ?? ""}>
                      {j.failedReason ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-[#6E6565]" title={shortData(j.data)}>
                      {shortData(j.data)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => retryFailedJob(j.queue, j.id), "Job reenfileirado.")}
                          className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1.5 text-xs font-bold text-[#901A1E] shadow-neumorphic transition active:shadow-neumorphic-inset disabled:opacity-40"
                          title="Reprocessar"
                        >
                          <RotateCw className="h-3.5 w-3.5 text-[#C5A059]" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removeFailedJob(j.queue, j.id), "Job removido.")}
                          className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1.5 text-xs font-bold text-[#6E6565] shadow-neumorphic transition active:shadow-neumorphic-inset disabled:opacity-40"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
