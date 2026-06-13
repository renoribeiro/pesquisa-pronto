import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { forTenant } from "@/lib/tenant";
import { checkTrendAlerts } from "@/modules/alerts/trend";

/**
 * Processa tarefas agendadas (resumos semanais, relatórios recorrentes,
 * retenção/anonimização LGPD).
 *
 * Atualmente executa a varredura de alertas preditivos (tendência negativa
 * de NPS) para cada tenant ativo.
 */
export async function processScheduler(job: Job): Promise<unknown> {
  // Listagem cross-tenant consciente: usa o client base para enumerar tenants.
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });

  let alertsCreated = 0;

  for (const t of tenants) {
    try {
      alertsCreated += await checkTrendAlerts(forTenant(t.id), t.id);
    } catch (err) {
      // Erro em um tenant não deve abortar a varredura dos demais.
      console.error(
        `[worker:scheduler] job ${job.name} (${job.id}) — falha ao checar alertas do tenant ${t.id}:`,
        err,
      );
    }
  }

  console.warn(
    `[worker:scheduler] job ${job.name} (${job.id}) — varredura de alertas concluída: ${alertsCreated} alerta(s) criado(s) em ${tenants.length} tenant(s)`,
  );

  return { tenants: tenants.length, alertsCreated };
}
