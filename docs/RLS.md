# RLS (Row-Level Security) — defesa em profundidade multitenant

A aplicação isola tenants em duas camadas:

1. **Camada de aplicação (sempre ativa):** `forTenant(tenantId)` / `withTenant(tenantId, …)`
   em `src/lib/tenant.ts` injetam `tenantId` em todo `where`/`create`. Mesmo uma
   query mal escrita não vaza entre clínicas.
2. **Camada de banco (RLS, opt-in):** policies do Postgres que filtram por
   `"tenantId" = current_setting('app.tenant_id', true)`. Mesmo um **bug** que
   escape da camada 1 não vaza — o banco recusa as linhas de outro tenant.

Este documento descreve como **ativar** a camada 2. O código já está pronto e é
um **no-op enquanto `RLS_ENABLED` estiver desligado** (padrão).

---

## Estado de fábrica (seguro)

- `RLS_ENABLED` ausente/`0` → `forTenant`/`withTenant` se comportam como sempre;
  nenhuma query é embrulhada em transação extra; nenhum GUC é definido.
- As policies **não** estão aplicadas no banco até você rodar `01-enable-rls.sql`.
- **Push/deploy do código não altera comportamento nem exige ação.**

## Como o código carrega o contexto

Quando `RLS_ENABLED=1`:

- `forTenant(id)` executa cada operação como `SELECT set_config('app.tenant_id', id, true)`
  seguido da query, na **mesma transação/conexão** (o `true` torna o GUC
  *transaction-scoped*, seguro com pool).
- `withTenant(id, fn)` abre **uma** transação, define o GUC e roda `fn(tx)` —
  use-o no lugar de `db.$transaction(...)` em código escopado por tenant.
- Fluxos cross-context que usam o cliente base (`prisma.$transaction`) —
  submissão pública de resposta e reset de senha — chamam `setTenantGuc(tx, id)`
  como primeira instrução.

> ⚠️ Com RLS ligado, **não** use `forTenant(id).$transaction(...)` (embrulho
> aninhado). Use `withTenant(id, …)`.

---

## Runbook de ativação

> Faça em **staging** primeiro e rode o checklist de validação antes de produção.

### 1. Preparar o role de runtime restrito

```bash
psql "$DATABASE_URL_OWNER" -f prisma/rls/02-setup-runtime-role.sql   # edite a senha
```

Crie/edite a connection string de runtime apontando para `app_runtime`:

```
DATABASE_URL=postgresql://app_runtime:<senha>@host:5432/db   # runtime (sujeito a RLS)
```

Mantenha o role **owner** para as migrações do Prisma (use uma URL separada de
migração, ex.: variável de ambiente do pipeline de deploy).

### 2. Aplicar as policies

```bash
psql "$DATABASE_URL_OWNER" -f prisma/rls/01-enable-rls.sql
```

`ENABLE` (sem `FORCE`) não afeta o owner — por isso o runtime precisa ser o role
restrito do passo 1.

### 3. Ligar o GUC na aplicação

```
RLS_ENABLED=1
```

Reinicie app e worker.

### 4. (Opcional) FORCE após validar

```bash
psql "$DATABASE_URL_OWNER" -f prisma/rls/03-force-rls.sql
```

---

## Checklist de validação (obrigatório antes de confiar no enforcement)

Rode com `RLS_ENABLED=1` e `DATABASE_URL` = `app_runtime`:

- [ ] **Login** (com e sem 2FA) e revalidação de sessão.
- [ ] **Submissão pública** de resposta (`/p/[slug]`) — cria Response + Answers.
- [ ] **Dashboard/analytics** — NPS, temas, entidades carregam só do tenant.
- [ ] **CRUD** de surveys/usuários/setores.
- [ ] **LGPD** — export, delete e varredura de retenção.
- [ ] **Webhook Amigo Tech** — enfileira e-mail e grava WebhookLog.
- [ ] **Isolamento cruzado** — autenticado no tenant A, nenhuma linha do tenant B
      é visível por qualquer tela/endpoint.
- [ ] **Jobs do worker** (trend-check, retention) processam por tenant.

---

## Limitação conhecida — conexão dupla (próximo passo de robustez)

Hoje há **um** `PrismaClient` (`src/lib/prisma.ts`); `forTenant`/`withTenant` o
estendem. Alguns lookups legítimos **cross-context** usam o cliente base sem
contexto de tenant prévio:

- Login: `prisma.tenant.findUnique({ slug })` (tabela `tenants` não tem
  `tenantId` → sem policy, ok) e `prisma.user.findUnique({ tenantId_email })`.
- Revalidação JWT: `prisma.user.findUnique({ id })`.
- Reset de senha: lookup global por `tokenHash`.

Sob **FORCE** + role restrito, esses lookups sem GUC sofreriam DEFAULT DENY. A
evolução recomendada é separar **dois clients/roles**:

- `prisma` base → role **privilegiado** (BYPASSRLS) para os lookups de sistema.
- cliente de tenant (forTenant/withTenant) → role **restrito** (sujeito a RLS).

Enquanto a conexão dupla não é implementada, recomenda-se ativar RLS em modo
**ENABLE (sem FORCE)** com a aplicação conectando como `app_runtime`: as queries
de tenant ficam protegidas e os lookups de sistema continuam funcionando.
`FORCE` só após a conexão dupla. Esse trade-off está documentado aqui de forma
explícita para não dar falsa sensação de enforcement total.
