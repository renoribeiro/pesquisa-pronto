"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotificationType } from "@prisma/client";
import { requireTenantDb } from "@/lib/session";

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

/** Lista as notificações não-arquivadas do usuário atual (mais recentes primeiro). */
export async function getNotifications(limit = 20): Promise<NotificationView[]> {
  const { ctx, db } = await requireTenantDb();
  const rows = await db.notification.findMany({
    where: { userId: ctx.userId, archived: false },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, type: true, title: true, body: true, read: true, createdAt: true },
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Contagem de notificações não-lidas (badge do sino). */
export async function getUnreadCount(): Promise<number> {
  const { ctx, db } = await requireTenantDb();
  return db.notification.count({ where: { userId: ctx.userId, read: false, archived: false } });
}

export async function markNotificationRead(id: string): Promise<void> {
  const { ctx, db } = await requireTenantDb();
  // updateMany com (id + userId) garante que o usuário só altera as próprias.
  await db.notification.updateMany({ where: { id, userId: ctx.userId }, data: { read: true } });
  revalidatePath("/admin");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { ctx, db } = await requireTenantDb();
  await db.notification.updateMany({
    where: { userId: ctx.userId, read: false, archived: false },
    data: { read: true },
  });
  revalidatePath("/admin");
}

export async function archiveNotification(id: string): Promise<void> {
  const { ctx, db } = await requireTenantDb();
  await db.notification.updateMany({
    where: { id, userId: ctx.userId },
    data: { archived: true, read: true },
  });
  revalidatePath("/admin");
}

// ── Preferências do usuário ───────────────────────────────────

export interface NotificationPrefView {
  emailEnabled: boolean;
  mutedTypes: NotificationType[];
}

export async function getNotificationPreference(): Promise<NotificationPrefView> {
  const { ctx, db } = await requireTenantDb();
  const pref = await db.notificationPreference.findUnique({ where: { userId: ctx.userId } });
  return {
    emailEnabled: pref?.emailEnabled ?? false,
    mutedTypes: pref?.mutedTypes ?? [],
  };
}

const prefSchema = z.object({
  emailEnabled: z.boolean(),
  mutedTypes: z
    .array(
      z.enum([
        "NEW_DETRACTOR",
        "TREND_ALERT",
        "WEEKLY_SUMMARY",
        "REPORT_SENT",
        "DISPATCH_ERROR",
        "SYSTEM",
      ]),
    )
    .default([]),
});

export async function updateNotificationPreference(input: unknown): Promise<void> {
  const { ctx, db } = await requireTenantDb();
  const data = prefSchema.parse(input);
  await db.notificationPreference.upsert({
    where: { userId: ctx.userId },
    create: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      emailEnabled: data.emailEnabled,
      mutedTypes: data.mutedTypes,
    },
    update: { emailEnabled: data.emailEnabled, mutedTypes: data.mutedTypes },
  });
  revalidatePath("/admin");
}
