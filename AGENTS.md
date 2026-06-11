<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

> Nota: o scaffold instalou **Next.js 16**. Consulte `node_modules/next/dist/docs/` ao usar APIs do Next.

# Pronto Satisfação — Guia do Projeto

Sistema de pesquisa de satisfação / NPS multitenant para a Prontoclínica de Fortaleza.
Escopo completo: [escopo-prontoclinica-survey.md](escopo-prontoclinica-survey.md).
Plano de desenvolvimento e milestones: [PLANO-DESENVOLVIMENTO.md](PLANO-DESENVOLVIMENTO.md).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **PostgreSQL 16** + **Prisma 6** (gerador clássico `prisma-client-js`)
- **Redis 7** + **BullMQ** (filas) — worker em processo separado
- **MinIO** (S3) para assets
- **Claude API** (Anthropic) para IA
- Dev local via **Docker Compose**; produção com Traefik (planejado)

## Comandos

```bash
npm run dev            # app Next.js (porta 3000)
npm run worker         # worker de filas (processo separado, hot-reload)
npm run services:up    # sobe Postgres, Redis, MinIO, Mailpit (precisa de Docker)
npm run db:migrate     # cria/aplica migrations (precisa do Postgres rodando)
npm run db:seed        # popula tenant Prontoclínica + super admin + setores
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format         # prettier --write
npm run build          # build de produção
```

## Convenções de arquitetura

- **Multitenant por linha**: toda tabela de negócio tem `tenantId`. **Nunca** consulte
  modelos com `tenantId` pelo client base `@/lib/prisma` na lógica de aplicação — use
  `forTenant(tenantId)` de `@/lib/tenant`, que injeta/filtra o tenant automaticamente.
  Ao adicionar um modelo com `tenantId`, **inclua o nome dele em `TENANT_MODELS`** em
  `src/lib/tenant.ts`.
- O client base `@/lib/prisma` é só para operações de sistema/cross-tenant (seed, Super Admin).
- **Filas**: defina jobs em `src/server/queues/`; processe em `src/workers/`. A criação de
  filas é preguiçosa (não conecta no import) — não instancie `Queue` no topo de módulo.
- **Env**: validado por Zod em `src/lib/env.ts`. Adicione novas variáveis lá e no `.env.example`.
- **Conexões Redis**: app e worker usam conexões distintas; ambas com `maxRetriesPerRequest: null`.

## Estado atual

**Fase 0 concluída em código** (bootstrap, base multitenant, filas/worker). Os DoDs que
exigem serviços rodando (migrations, seed, smoke test de fila) ficam pendentes até haver um
runtime de containers na máquina (Docker/Colima ainda não instalado). Próximo: Fase 1 — Auth/RBAC.
