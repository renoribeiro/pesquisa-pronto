"use server";

import { revalidatePath } from "next/cache";
import { AlertType } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
