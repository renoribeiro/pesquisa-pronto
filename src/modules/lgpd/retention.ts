import { Prisma } from "@prisma/client";
import { withTenant, type TenantClient } from "@/lib/tenant";

/**
 * Anonimiza/expurga as Responses cujo período de retenção LGPD expirou.
 *
 * Critério: `createdAt` anterior ao cutoff (agora − `retentionMonths` meses),
 * ainda não anonimizadas (`anonymizedAt` null) e que ainda carreguem algum dado
 * pessoal/desanonimizável (`ipHash` ou `recipientId` não nulos).
 *
 * Ação: zera `ipHash` e `recipientId`, marca `anonymous = true` e grava
 * `anonymizedAt`. Os dados agregados (`npsScore`, respostas/Answers) são
 * preservados para fins estatísticos.
 *
 * O cliente `db` já é escopado por tenant (via `forTenant`), portanto não é
 * necessário (nem permitido) adicionar `tenantId` ao `where`.
 *
 * @returns quantidade de Responses anonimizadas.
 */
export async function anonymizeExpiredResponses(
  db: TenantClient,
  tenantId: string,
  retentionMonths: number,
): Promise<number> {
  // Cutoff = agora − retentionMonths meses, robusto ao overflow de dia do mês.
  // (setMonth ingênuo em 31/03 −1mês viraria 31/02 → 03/03, antecipando o cutoff
  // e anonimizando respostas ainda dentro da janela.) Fixamos o dia em 1 antes de
  // subtrair os meses e então reposicionamos, sem ultrapassar o último dia do mês.
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  const lastDayOfMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(now.getDate(), lastDayOfMonth));

  const where = {
    createdAt: { lt: cutoff },
    anonymizedAt: null,
    OR: [{ ipHash: { not: null } }, { recipientId: { not: null } }],
  };

  // Captura os ids antes do update para limpar a PII derivada nas análises de IA.
  const expiring = await db.response.findMany({ where, select: { id: true } });
  const ids = expiring.map((r) => r.id);
  if (ids.length === 0) return 0;

  const count = await withTenant(tenantId, async (tx) => {
    // Resumo/emoções/entidades + embedding das análises podem conter / derivar do
    // texto livre do paciente (o vetor é reversível-por-similaridade).
    await tx.aIAnalysis.updateMany({
      where: { responseId: { in: ids } },
      data: { summary: null, emotions: Prisma.DbNull, entities: Prisma.DbNull },
    });
    await tx.$executeRawUnsafe(
      'UPDATE "ai_analyses" SET "embedding" = NULL WHERE "responseId" = ANY($1::text[]) AND "tenantId" = $2',
      ids,
      tenantId,
    );
    const result = await tx.response.updateMany({
      where: { id: { in: ids } },
      data: { ipHash: null, recipientId: null, anonymous: true, anonymizedAt: new Date() },
    });
    return result.count;
  });

  return count;
}
