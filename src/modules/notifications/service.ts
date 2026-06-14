import { NotificationType, AlertType } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { enqueueEmail } from "@/server/queues";
import { escapeHtml } from "@/lib/html";
import { logger } from "@/lib/logger";

/**
 * Geração de notificações a partir de alertas (M2.5). Cada alerta criado gera
 * uma Notification por usuário-alvo (gestão da clínica), respeitando as
 * preferências de cada um (mute por tipo + e-mail opcional). É best-effort:
 * nunca lança — uma falha aqui não deve impedir a criação do alerta.
 */

const ALERT_TO_NOTIFICATION: Record<AlertType, NotificationType> = {
  DETRACTOR: NotificationType.NEW_DETRACTOR,
  NEGATIVE_TREND: NotificationType.TREND_ALERT,
  EMERGING_THEME: NotificationType.TREND_ALERT,
  LOW_VOLUME: NotificationType.TREND_ALERT,
};

// Perfis que recebem alertas operacionais (gestão).
const NOTIFY_ROLES = ["CLINIC_ADMIN", "SUPER_ADMIN"] as const;

export interface NotifyAlertInput {
  alertType: AlertType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export async function notifyAlert(
  db: TenantClient,
  tenantId: string,
  input: NotifyAlertInput,
): Promise<void> {
  try {
    const notifType = ALERT_TO_NOTIFICATION[input.alertType];

    const users = await db.user.findMany({
      where: { active: true, role: { in: [...NOTIFY_ROLES] } },
      select: { id: true, email: true },
    });
    if (users.length === 0) return;

    const prefs = await db.notificationPreference.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, emailEnabled: true, mutedTypes: true },
    });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

    const rows: { tenantId: string; userId: string; type: NotificationType; title: string; body: string | null; metadata?: object }[] = [];
    const emailTargets: string[] = [];

    for (const u of users) {
      const pref = prefByUser.get(u.id);
      if (pref?.mutedTypes.includes(notifType)) continue; // tipo silenciado
      rows.push({
        tenantId,
        userId: u.id,
        type: notifType,
        title: input.title,
        body: input.body ?? null,
        metadata: input.metadata,
      });
      if (pref?.emailEnabled && u.email) emailTargets.push(u.email);
    }

    if (rows.length > 0) {
      await db.notification.createMany({ data: rows });
    }

    // E-mail opcional (best-effort, via fila).
    for (const to of emailTargets) {
      try {
        await enqueueEmail({
          to,
          subject: `[Alerta] ${input.title}`,
          html: `<p><strong>${escapeHtml(input.title)}</strong></p>${input.body ? `<p>${escapeHtml(input.body)}</p>` : ""}<p style="color:#666;font-size:12px">Notificação automática do Pronto Satisfação.</p>`,
          text: `${input.title}${input.body ? `\n\n${input.body}` : ""}`,
        });
      } catch (err) {
        logger.warn("[notifications] falha ao enfileirar e-mail de alerta", err);
      }
    }
  } catch (err) {
    logger.error("[notifications] notifyAlert falhou (best-effort)", err);
  }
}
