"use server";

import { revalidatePath } from "next/cache";
import { AlertType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getWhatsAppProvider } from "@/lib/channels/whatsapp";

async function notifyWhatsAppAlert(tenantId: string, npsScore: number, surveyId: string) {
  try {
    // 1. Obter a configuração do threshold para ver se há telefones configurados
    const threshold = await prisma.alertThreshold.findUnique({
      where: { tenantId_type: { tenantId, type: AlertType.DETRACTOR } },
    });

    let phones: string[] = [];
    if (threshold?.config) {
      const cfg = threshold.config as Record<string, unknown>;
      if (typeof cfg.notificationPhones === "string" && cfg.notificationPhones.trim()) {
        phones = cfg.notificationPhones.split(",").map((p) => p.trim());
      } else if (Array.isArray(cfg.notificationPhones)) {
        phones = cfg.notificationPhones.map((p) => String(p).trim());
      }
    }

    // 2. Fallback para o telefone de contato do tenant
    if (phones.length === 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { contactPhone: true },
      });
      if (tenant?.contactPhone) {
        phones.push(tenant.contactPhone);
      }
    }

    if (phones.length === 0) {
      console.log(`[alerts:whatsapp] Nenhum telefone cadastrado para o tenant ${tenantId}`);
      return;
    }

    // 3. Obter dados da pesquisa
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
      select: { title: true },
    });

    // 4. Enviar mensagem de WhatsApp via provider para cada telefone
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
  const thresholds = await prisma.alertThreshold.findMany({
    where: { tenantId, active: true },
  });

  for (const threshold of thresholds) {
    const cfg = threshold.config as Record<string, unknown>;

    if (threshold.type === AlertType.DETRACTOR && npsScore !== null) {
      const limit = Number(cfg.below ?? 7);
      if (npsScore < limit) {
        await createAlertIfNotExists(tenantId, {
          type: AlertType.DETRACTOR,
          title: `Detrator detectado: NPS ${npsScore}`,
          message: `Uma resposta com NPS ${npsScore} foi registrada, indicando um detrator (abaixo de ${limit}).`,
          surveyId,
        });

        // Dispara notificação no WhatsApp (Close-Loop)
        await notifyWhatsAppAlert(tenantId, npsScore, surveyId);
      }
    }

    if (threshold.type === AlertType.NEGATIVE_TREND) {
      // Triggered by AI analysis processor, not here
    }
  }
}

async function createAlertIfNotExists(
  tenantId: string,
  data: { type: AlertType; title: string; message: string; surveyId?: string },
) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      tenantId,
      type: data.type,
      status: "OPEN",
      surveyId: data.surveyId ?? null,
      createdAt: { gte: since },
    },
  });
  if (existing) return;

  await prisma.alert.create({
    data: { tenantId, ...data },
  });
}

export async function acknowledgeAlert(alertId: string) {
  const { db } = await requirePermission("survey:view");
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
