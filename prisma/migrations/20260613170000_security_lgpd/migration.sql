-- AlterTable: revalidação de sessão (bump invalida JWTs existentes)
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: marca de anonimização/expurgo pela retenção LGPD
ALTER TABLE "responses" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- AlterTable: idempotência de webhooks de entrada
ALTER TABLE "webhook_logs" ADD COLUMN "externalEventId" TEXT;

-- CreateIndex: unicidade por (tenant, evento externo). NULLs distintos no Postgres,
-- então logs sem externalEventId não colidem.
CREATE UNIQUE INDEX "webhook_logs_tenantId_externalEventId_key" ON "webhook_logs"("tenantId", "externalEventId");
