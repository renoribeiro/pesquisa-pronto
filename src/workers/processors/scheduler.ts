import type { Job } from "bullmq";

/**
 * Processa tarefas agendadas (resumos semanais, relatórios recorrentes,
 * retenção/anonimização LGPD). Lógica real preenchida em M1.8/M1.9/M2.7.
 */
export async function processScheduler(job: Job): Promise<unknown> {
  console.warn(
    `[worker:scheduler] job ${job.name} (${job.id}) — processador ainda não implementado`,
  );
  return null;
}
