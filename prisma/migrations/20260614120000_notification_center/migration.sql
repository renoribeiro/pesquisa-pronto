-- Central de notificações (M2.5):
--   • índice composto para a consulta de não-lidas por usuário;
--   • tabela de preferências de notificação por usuário (mute por tipo + email).

CREATE INDEX "notifications_userId_read_archived_idx"
  ON "notifications" ("userId", "read", "archived");

CREATE TABLE "notification_preferences" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mutedTypes"   "NotificationType"[] NOT NULL DEFAULT ARRAY[]::"NotificationType"[],
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_userId_key"
  ON "notification_preferences" ("userId");

CREATE INDEX "notification_preferences_tenantId_idx"
  ON "notification_preferences" ("tenantId");

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
