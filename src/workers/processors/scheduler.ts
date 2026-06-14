import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { forTenant } from "@/lib/tenant";
import { checkTrendAlerts, checkLowVolumeAlerts } from "@/modules/alerts/trend";
import { anonymizeExpiredResponses } from "@/modules/lgpd/retention";
import { logger } from "@/lib/logger";

/**
 * Processa tarefas agendadas (varredura de alertas preditivos, retenção/
 * anonimização LGPD). O dispatch é por `job.name`.
 */
export async function processScheduler(job: Job): Promise<unknown> {
  switch (job.name) {
    case "retention":
      return runRetentionSweep(job);
    case "trend-check":
      return runTrendSweep(job);
    default:
      // Nome desconhecido: não assume varredura — registra e ignora, evitando
      // executar a tarefa errada por um job mal-agendado.
      logger.warn(`[worker:scheduler] job.name desconhecido, ignorado: ${job.name}`);
      return { skipped: true, name: job.name };
  }
}

/** Varredura de alertas preditivos (tendência negativa + volume baixo) por tenant ativo. */
async function runTrendSweep(job: Job): Promise<unknown> {
  const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
  let alertsCreated = 0;

  for (const t of tenants) {
    const db = forTenant(t.id);
    try {
      alertsCreated += await checkTrendAlerts(db, t.id);
    } catch (err) {
      logger.error(`[worker:scheduler] ${job.name} — falha no trend do tenant ${t.id}:`, err);
    }
    try {
      alertsCreated += await checkLowVolumeAlerts(db, t.id);
    } catch (err) {
      logger.error(`[worker:scheduler] ${job.name} — falha no low-volume do tenant ${t.id}:`, err);
    }
  }

  logger.info(
    `[worker:scheduler] ${job.name} — varredura de alertas: ${alertsCreated} criado(s) em ${tenants.length} tenant(s)`,
  );
  return { tenants: tenants.length, alertsCreated };
}

/** Retenção LGPD: anonimiza respostas além da janela de retenção por tenant. */
async function runRetentionSweep(job: Job): Promise<unknown> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true, retentionMonths: true },
  });
  let anonymized = 0;

  for (const t of tenants) {
    try {
      const months = t.retentionMonths ?? 24;
      anonymized += await anonymizeExpiredResponses(forTenant(t.id), t.id, months);
    } catch (err) {
      logger.error(
        `[worker:scheduler] ${job.name} — falha na retenção do tenant ${t.id}:`,
        err,
      );
    }
  }

  logger.info(
    `[worker:scheduler] ${job.name} — retenção LGPD: ${anonymized} resposta(s) anonimizada(s) em ${tenants.length} tenant(s)`,
  );
  return { tenants: tenants.length, anonymized };
}
