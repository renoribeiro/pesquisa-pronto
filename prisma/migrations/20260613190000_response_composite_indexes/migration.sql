-- Índices compostos para os filtros mais comuns do dashboard/analytics sobre
-- `responses` (degradam com volume sem índice dedicado):
--   • respostas completas por período  → ("tenantId","completed","createdAt")
--   • agregação de NPS por tenant       → ("tenantId","npsScore")
--
-- Observação operacional: em tabelas grandes, prefira criar manualmente com
-- CREATE INDEX CONCURRENTLY (fora de transação) para evitar lock de escrita.
-- A migração padrão do Prisma roda em transação, então usa CREATE INDEX comum.

CREATE INDEX "responses_tenantId_completed_createdAt_idx"
  ON "responses" ("tenantId", "completed", "createdAt");

CREATE INDEX "responses_tenantId_npsScore_idx"
  ON "responses" ("tenantId", "npsScore");
