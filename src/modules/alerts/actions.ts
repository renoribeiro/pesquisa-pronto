"use server";

import { revalidatePath } from "next/cache";
import { AlertType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { forTenant, type TenantClient } from "@/lib/tenant";
import { getWhatsAppProvider } from "@/lib/channels/whatsapp";

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
export async function checkAlerts(tenantId: string, surveyId: string, npsScore: number | null) {
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
  data: { type: AlertType; title: string; message: string; surveyId?: string },
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
  const { db } = await requirePermission("alert:manage");
  await db.alert.update({
    where: { id: alertId },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });
  revalidatePath("/admin/alerts");
}

export async function getAlerts() {
  const { db } = await requirePermission("survey:view");
  return db.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { survey: { select: { title: true } } },
  });
}
