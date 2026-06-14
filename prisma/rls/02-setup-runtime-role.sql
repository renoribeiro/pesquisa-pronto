-- =============================================================================
-- RLS — role de runtime restrito (sujeito às policies)
-- =============================================================================
-- Cria um role `app_runtime` que NÃO é owner das tabelas e NÃO tem BYPASSRLS,
-- portanto fica SUJEITO às policies de RLS. A aplicação deve conectar com este
-- role em produção (DATABASE_URL), enquanto as MIGRAÇÕES continuam rodando com o
-- role owner/privilegiado (DIRECT_URL / role de migração).
--
-- ⚠️  Edite a senha antes de aplicar. Ajuste o nome do schema/owner se necessário.
-- =============================================================================

-- 1) Cria o role de runtime (login). Troque a senha!
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'CHANGE_ME_strong_password';
  END IF;
END $$;

-- 2) Permissões de uso do schema e DML nas tabelas existentes.
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- 3) Default privileges: novas tabelas/sequences criadas pelo owner já concedem
--    DML ao runtime (ajuste o owner_role se o seu owner não for o usuário atual).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- 4) Garante que o runtime NÃO ignora RLS.
ALTER ROLE app_runtime NOBYPASSRLS;

-- Observação: o role owner (dono das tabelas) continua ignorando RLS sob ENABLE
-- (sem FORCE). É por isso que a aplicação deve usar app_runtime, não o owner.
-- Determinados fluxos cross-context legítimos (login por slug, lookup de token
-- de reset, jobs de sistema) usam o cliente base do Prisma — ver docs/RLS.md
-- para a estratégia de conexão dupla (base privilegiado × runtime restrito).
