-- =============================================================================
-- RLS (Row-Level Security) — 2ª camada de isolamento multitenant
-- =============================================================================
-- Aplica ENABLE ROW LEVEL SECURITY + policy de isolamento por tenant em TODAS as
-- tabelas que possuem a coluna "tenantId". É idempotente (pode ser reaplicado).
--
-- ⚠️  APLIQUE MANUALMENTE — NÃO faz parte das migrações automáticas do Prisma.
--    Enabling RLS só é seguro depois de você garantir que o role de runtime da
--    aplicação está preparado (ver 02-setup-runtime-role.sql) e validar os
--    fluxos. Ver docs/RLS.md para o runbook completo.
--
-- Importante sobre o comportamento:
--   • A policy usa current_setting('app.tenant_id', true): quando o GUC não está
--     definido, retorna NULL → "tenantId" = NULL é NULL (não true) → DEFAULT DENY
--     (nenhuma linha visível). Isso é proposital: nenhuma query sem contexto de
--     tenant deve enxergar dados.
--   • A aplicação define o GUC por transação (set_config('app.tenant_id', …, true))
--     em forTenant/withTenant quando RLS_ENABLED=1 (ver src/lib/tenant.ts).
--   • ENABLE (sem FORCE) NÃO se aplica ao OWNER da tabela nem a superusers. Para
--     que o enforcement valha para o role de runtime, ele NÃO pode ser o owner
--     nem ter BYPASSRLS (ver 02-setup-runtime-role.sql). Para forçar inclusive ao
--     owner, ver 03-force-rls.sql (somente após validação).
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I '
      'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      r.table_name
    );
    RAISE NOTICE 'RLS habilitado em %', r.table_name;
  END LOOP;
END $$;
