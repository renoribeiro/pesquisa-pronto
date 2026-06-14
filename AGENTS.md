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

**Fases 0, 1, 2 e 3 implementadas em código.** Roadmap (PLANO-DESENVOLVIMENTO.md) concluído,
incluindo a última leva:

- **M2.2** Disparo em lote (CSV/Excel): upload, mapeamento de colunas, preview/validação,
  agendamento e relatório de lotes (`channels/batch-actions.ts`, `lib/recipients.ts`).
- **M2.3** Filtro por tema na nuvem de palavras + alerta de tema emergente (`alerts/emerging.ts`).
- **M2.4** Alertas `LOW_VOLUME`, UI de thresholds (Configurações → Alertas) e análise
  comparativa temporal por IA (`analytics/comparative.ts`, `generateComparativeNarrative`).
- **M2.5** Central de notificações em tempo real: SSE (`/api/notifications/stream`), sino no
  header, preferências por usuário, alertas geram `Notification` (`modules/notifications/`).
- **M2.6** Widget embed: aba Embed com snippets inline/popup + loader `public/embed.js`.
- **M3.5** i18n do formulário público (pt-BR/en/es) com seletor — ver `docs/I18N.md`
  (admin permanece pt-BR; migração incremental).
- **M3.4** App mobile (React Native): deferido para repo separado — ver `docs/MOBILE.md`.

Os DoDs que exigem serviços rodando (migrations aplicadas, seed, smoke de fila, teste e2e de
SSE/embed cross-origin) seguem pendentes de um runtime de containers. Validação atual:
`typecheck`, `lint`, `build` e `vitest` (76 testes) passam. Ao subir o ambiente, aplicar a
migration `20260614120000_notification_center` e re-rodar os scripts de RLS (`prisma/rls/`),
que cobrem automaticamente a nova tabela `notification_preferences`.
