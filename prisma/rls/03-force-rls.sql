-- =============================================================================
-- RLS — FORCE (opcional, somente após validação)
-- =============================================================================
-- ENABLE ROW LEVEL SECURITY não se aplica ao OWNER das tabelas. Se a sua
-- aplicação, por qualquer motivo, conectar com o role owner, as policies NÃO
-- valerão. FORCE ROW LEVEL SECURITY estende o enforcement inclusive ao owner.
--
-- ⚠️  Só aplique DEPOIS de:
--   1) Rodar 01-enable-rls.sql e 02-setup-runtime-role.sql;
--   2) Definir RLS_ENABLED=1 e apontar DATABASE_URL para app_runtime;
--   3) Validar TODOS os fluxos (login, submissão pública, dashboard, CRUD,
--      retenção/LGPD, webhooks) — ver checklist em docs/RLS.md.
--
-- Com FORCE, qualquer conexão (mesmo owner) que não defina app.tenant_id verá
-- DEFAULT DENY. Migrações/seed que operam cross-tenant devem usar set_config ou
-- um role com BYPASSRLS explícito.
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
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);
    RAISE NOTICE 'RLS FORCE aplicado em %', r.table_name;
  END LOOP;
END $$;
