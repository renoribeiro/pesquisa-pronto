import { NotificationType, AlertType } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { enqueueEmail } from "@/server/queues";
import { escapeHtml } from "@/lib/html";
import { logger } from "@/lib/logger";

/**
 * Geração de notificações da central (M2.5). Best-effort: nunca lança — uma
 * falha aqui não deve impedir o evento que a originou (alerta, resumo, etc.).
 */

const ALERT_TO_NOTIFICATION: Record<AlertType, NotificationType> = {
  DETRACTOR: NotificationType.NEW_DETRACTOR,
  NEGATIVE_TREND: NotificationType.TREND_ALERT,
  EMERGING_THEME: NotificationType.TREND_ALERT,
  LOW_VOLUME: NotificationType.TREND_ALERT,
};

// Perfis que recebem notificações operacionais (gestão).
const NOTIFY_ROLES = ["CLINIC_ADMIN", "SUPER_ADMIN"] as const;

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

type TargetUser = { id: string; email: string | null };

/**
 * Núcleo: cria uma Notification por usuário-alvo respeitando as preferências
 * (mute por tipo + e-mail opcional). Compartilhado por notifyManagers/notifyUser.
 */
async function dispatchNotifications(
  db: TenantClient,
  tenantId: string,
  users: TargetUser[],
  input: NotificationInput,
): Promise<void> {
  if (users.length === 0) return;

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, emailEnabled: true, mutedTypes: true },
  });
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  const rows: {
    tenantId: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string | null;
    metadata?: object;
  }[] = [];
  const emailTargets: string[] = [];

  for (const u of users) {
    const pref = prefByUser.get(u.id);
    if (pref?.mutedTypes.includes(input.type)) continue; // tipo silenciado
    rows.push({
      tenantId,
      userId: u.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      metadata: input.metadata,
    });
    if (pref?.emailEnabled && u.email) emailTargets.push(u.email);
  }

  if (rows.length > 0) {
    await db.notification.createMany({ data: rows });
  }

  for (const to of emailTargets) {
    try {
      await enqueueEmail({
        to,
        subject: `[Notificação] ${input.title}`,
        html: `<p><strong>${escapeHtml(input.title)}</strong></p>${input.body ? `<p>${escapeHtml(input.body)}</p>` : ""}<p style="color:#666;font-size:12px">Notificação automática do Pronto Satisfação.</p>`,
        text: `${input.title}${input.body ? `\n\n${input.body}` : ""}`,
      });
    } catch (err) {
      logger.warn("[notifications] falha ao enfileirar e-mail", err);
    }
  }
}

/** Notifica a gestão da clínica (CLINIC_ADMIN + SUPER_ADMIN). */
export async function notifyManagers(
  db: TenantClient,
  tenantId: string,
  input: NotificationInput,
): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: { active: true, role: { in: [...NOTIFY_ROLES] } },
      select: { id: true, email: true },
    });
    await dispatchNotifications(db, tenantId, users, input);
  } catch (err) {
    logger.error("[notifications] notifyManagers falhou (best-effort)", err);
  }
}

/** Notifica um usuário específico (ex.: autor de um relatório). */
export async function notifyUser(
  db: TenantClient,
  tenantId: string,
  userId: string,
  input: NotificationInput,
): Promise<void> {
  try {
    const user = await db.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true, email: true },
    });
    if (!user) return;
    await dispatchNotifications(db, tenantId, [user], input);
  } catch (err) {
    logger.error("[notifications] notifyUser falhou (best-effort)", err);
  }
}

export interface NotifyAlertInput {
  alertType: AlertType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

/** Notifica a gestão a partir de um alerta (mapeia AlertType → NotificationType). */
export async function notifyAlert(
  db: TenantClient,
  tenantId: string,
  input: NotifyAlertInput,
): Promise<void> {
  await notifyManagers(db, tenantId, {
    type: ALERT_TO_NOTIFICATION[input.alertType],
    title: input.title,
    body: input.body,
    metadata: input.metadata,
  });
}
