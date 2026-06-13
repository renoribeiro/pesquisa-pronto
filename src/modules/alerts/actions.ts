"use server";

import { revalidatePath } from "next/cache";
import { AlertType } from "@prisma/client";
import { requirePermission, surveySectorWhere, type SessionContext } from "@/lib/session";
import type { Scope } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { forTenant, type TenantClient } from "@/lib/tenant";
import { getWhatsAppProvider } from "@/lib/channels/whatsapp";
import { suggestCloseLoopMessage } from "@/lib/ai";
import { checkTrendAlerts } from "@/modules/alerts/trend";

/**
 * Filtro de alertas por escopo de setor. Alertas tenant-wide (surveyId null,
 * ex.: NEGATIVE_TREND) permanecem visíveis; alertas ligados a pesquisa são
 * restritos aos setores do usuário.
 */
function alertSectorWhere(ctx: SessionContext, scope: Scope) {
  if (scope !== "sector") return {};
  return { OR: [{ surveyId: null }, { survey: surveySectorWhere(ctx, scope) }] };
}

/** Carrega um alerta garantindo que está no escopo de setor do usuário. Lança se fora. */
async function assertAlertInScope(
  db: TenantClient,
  ctx: SessionContext,
  scope: Scope,
  alertId: string,
) {
  const where =
    scope === "sector"
      ? { id: alertId, ...alertSectorWhere(ctx, scope) }
      : { id: alertId };
  const alert = await db.alert.findFirst({
    where,
    include: { survey: { select: { title: true } } },
  });
  if (!alert) throw new Error("Alerta não encontrado.");
  return alert;
}

/** Normaliza um telefone para apenas dígitos; retorna null se inválido. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Exige um número minimamente plausível (DDD + número).
  return digits.length >= 10 ? digits : null;
}

async function notifyWhatsAppAlert(
  db: TenantClient,
  tenantId: string,
  npsScore: number,
  surveyId: string,
) {
  try {
    // 1. Obter a configuração do threshold para ver se há telefones configurados
    const threshold = await db.alertThreshold.findUnique({
      where: { tenantId_type: { tenantId, type: AlertType.DETRACTOR } },
    });

    const rawPhones: string[] = [];
    if (threshold?.config) {
      const cfg = threshold.config as Record<string, unknown>;
      if (typeof cfg.notificationPhones === "string" && cfg.notificationPhones.trim()) {
        rawPhones.push(...cfg.notificationPhones.split(","));
      } else if (Array.isArray(cfg.notificationPhones)) {
        rawPhones.push(...cfg.notificationPhones.map((p) => String(p)));
      }
    }

    // 2. Fallback para o telefone de contato do tenant.
    //    Tenant não possui coluna `tenantId` (é o próprio tenant) → client base.
    if (rawPhones.length === 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { contactPhone: true },
      });
      if (tenant?.contactPhone) {
        rawPhones.push(tenant.contactPhone);
      }
    }

    // 3. Validar e deduplicar telefones (apenas dígitos, sem repetições).
    const phones = [...new Set(rawPhones.map(normalizePhone).filter((p): p is string => p !== null))];

    if (phones.length === 0) {
      console.log(`[alerts:whatsapp] Nenhum telefone cadastrado para o tenant ${tenantId}`);
      return;
    }

    // 4. Obter dados da pesquisa (escopado por tenant via guard)
    const survey = await db.survey.findUnique({
      where: { id: surveyId },
      select: { title: true },
    });

    // 5. Enviar mensagem de WhatsApp via provider para cada telefone
    const provider = getWhatsAppProvider();
    for (const phone of phones) {
      const res = await provider.send({
        to: phone,
        templateName: "alerta_detrator",
        variables: {
          "1": String(npsScore),
          "2": survey?.title ?? "Pesquisa",
        },
      });
      if (res.success) {
        console.log(`[alerts:whatsapp] Notificação enviada para ${phone}`);
      } else {
        console.error(`[alerts:whatsapp] Falha ao enviar para ${phone}: ${res.error}`);
      }
    }
  } catch (err) {
    console.error(`[alerts:whatsapp] Erro ao enviar notificação WhatsApp:`, err);
  }
}

/** Check and create alerts after a new response is submitted. */
export async function checkAlerts(
  tenantId: string,
  surveyId: string,
  npsScore: number | null,
  responseId?: string,
) {
  const db = forTenant(tenantId);

  const thresholds = await db.alertThreshold.findMany({
    where: { active: true },
  });

  for (const threshold of thresholds) {
    const cfg = threshold.config as Record<string, unknown>;

    if (threshold.type === AlertType.DETRACTOR && npsScore !== null) {
      const limit = Number(cfg.below ?? 7);
      if (npsScore < limit) {
        await createAlertIfNotExists(db, tenantId, {
          type: AlertType.DETRACTOR,
          title: `Detrator detectado: NPS ${npsScore}`,
          message: `Uma resposta com NPS ${npsScore} foi registrada, indicando um detrator (abaixo de ${limit}).`,
          surveyId,
          // responseId permite buscar o comentário DESTE paciente no close-loop.
          metadata: { npsScore, ...(responseId ? { responseId } : {}) },
        });

        // Dispara notificação no WhatsApp (Close-Loop)
        await notifyWhatsAppAlert(db, tenantId, npsScore, surveyId);
      }
    }

    if (threshold.type === AlertType.NEGATIVE_TREND) {
      // Triggered by AI analysis processor, not here
    }
  }
}

async function createAlertIfNotExists(
  db: TenantClient,
  tenantId: string,
  data: {
    type: AlertType;
    title: string;
    message: string;
    surveyId?: string;
    metadata?: { npsScore: number; responseId?: string };
  },
) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const existing = await db.alert.findFirst({
    where: {
      type: data.type,
      status: "OPEN",
      surveyId: data.surveyId ?? null,
      createdAt: { gte: since },
    },
  });
  if (existing) return;

  // tenantId explícito para satisfazer os tipos do Prisma (o guard forTenant
  // também o injeta em runtime — valor idêntico, redundância segura).
  await db.alert.create({
    data: { ...data, tenantId },
  });
}

export async function acknowledgeAlert(alertId: string) {
  const { ctx, db, scope } = await requirePermission("alert:manage");
  await assertAlertInScope(db, ctx, scope, alertId); // bloqueia ações fora do setor
  await db.alert.update({
    where: { id: alertId },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });
  revalidatePath("/admin/alerts");
}

export async function getAlerts() {
  const { ctx, db, scope } = await requirePermission("survey:view");
  return db.alert.findMany({
    where: alertSectorWhere(ctx, scope),
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { survey: { select: { title: true } } },
  });
}

/**
 * Gera (e cacheia) um rascunho de mensagem de close-loop para o paciente
 * detrator associado ao alerta, via IA. Exige permissão de gestão de alertas.
 */
export async function suggestAlertResponse(alertId: string): Promise<string> {
  const { ctx, db, scope } = await requirePermission("alert:manage");
  const alert = await assertAlertInScope(db, ctx, scope, alertId);
  // Close-loop só faz sentido para detrator (paciente real + nota). Não confiar
  // só no gating da UI: validar o tipo também no servidor.
  if (alert.type !== AlertType.DETRACTOR) {
    throw new Error("Sugestão de close-loop disponível apenas para alertas de detrator.");
  }
  if (alert.suggestedAction) return alert.suggestedAction; // cache

  // Lock curto por alerta: serializa a geração para evitar DOUBLE-SPEND de IA
  // (duas chamadas concorrentes pagariam a chamada ao Claude antes de disputar
  // a escrita). Quem não adquire o lock relê o valor já gerado em vez de pagar.
  const lockKey = `lock:closeloop:${alertId}`;
  const acquired = await redis.set(lockKey, "1", "EX", 30, "NX");
  if (acquired !== "OK") {
    const fresh = await db.alert.findFirst({ where: { id: alertId }, select: { suggestedAction: true } });
    if (fresh?.suggestedAction) return fresh.suggestedAction;
    throw new Error("Geração de sugestão em andamento. Tente novamente em instantes.");
  }

  try {
    // Relê dentro do lock: o vencedor pode ter gravado entre a leitura inicial
    // e a aquisição do lock.
    const current = await db.alert.findFirst({
      where: { id: alertId },
      select: { suggestedAction: true },
    });
    if (current?.suggestedAction) return current.suggestedAction;

    // Tenant não é tenant-scoped → client base, lookup por id (seguro).
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });

    const meta = (alert.metadata ?? {}) as Record<string, unknown>;
    const npsScore = typeof meta.npsScore === "number" ? meta.npsScore : null;
    const responseId = typeof meta.responseId === "string" ? meta.responseId : null;

    // Usa o comentário DESTE paciente (pela resposta que gerou o alerta), não um
    // comentário qualquer da pesquisa. Sem responseId (alertas antigos) ou sem
    // análise de texto, omite o comentário em vez de usar o de outro paciente.
    let comment: string | undefined;
    if (responseId) {
      const a = await db.aIAnalysis.findFirst({
        where: { responseId },
        select: { summary: true },
      });
      comment = a?.summary ?? undefined;
    }

    const text = await suggestCloseLoopMessage(
      {
        clinicName: tenant?.name ?? "nossa clínica",
        surveyTitle: alert.survey?.title ?? "Pesquisa de Satisfação",
        npsScore,
        comment,
      },
      { tenantId: ctx.tenantId, jobType: "suggestion" },
    );

    await db.alert.update({ where: { id: alertId }, data: { suggestedAction: text } });
    revalidatePath("/admin/alerts");
    return text;
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

/** Roda a checagem de tendência negativa sob demanda para o tenant atual. */
export async function runTrendCheck(): Promise<number> {
  const { ctx, db } = await requirePermission("alert:manage");
  const created = await checkTrendAlerts(db, ctx.tenantId);
  revalidatePath("/admin/alerts");
  return created;
}
