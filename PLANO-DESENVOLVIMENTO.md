# PLANO DE DESENVOLVIMENTO — Sistema de Pesquisa de Satisfação Prontoclínica

**Base:** [escopo-prontoclinica-survey.md](escopo-prontoclinica-survey.md)
**Status:** Aguardando aprovação (nenhum código escrito ainda)
**Data:** Junho/2026

---

## 0. Decisões que orientam este plano

Definidas em conversa com o solicitante:

| Decisão                 | Escolha                                                 |
| ----------------------- | ------------------------------------------------------- |
| Escopo do plano         | **Fases 1, 2 e 3 completas**                            |
| Arquitetura multitenant | **`tenant_id` em tudo desde o início**                  |
| Claude API              | **Chave disponível** — IA real desde o começo           |
| Ambiente                | **Local-first** (Docker local agora; deploy VPS depois) |
| WhatsApp/WABA           | **Disponível** — integração real                        |
| SMS (Zenvia/Twilio)     | **Sem credenciais** → provider abstrato + mock          |
| Amigo Tech              | **Sem docs/credenciais** → contrato de webhook + mock   |
| Ativos de marca         | **Disponíveis** — aplicar quando enviados               |
| Versionamento           | **`git init` nesta pasta**                              |
| Fluxo                   | **Plano → aprovação → código**                          |

### Pendências que preciso de você (não bloqueiam o início)

1. **Ativos de marca**: logo (PNG/SVG), cores institucionais (HEX), fontes preferidas.
2. **Chave da Claude API** (Anthropic) — para o `.env` local.
3. **Credenciais WhatsApp** (Meta Cloud API): token, Phone Number ID, WABA ID, nome dos templates HSM aprovados.
4. **Domínio/DNS** quando formos para produção.
5. (Futuro) Docs/credenciais **Amigo Tech** e **gateway SMS**.

---

## 1. Princípios de arquitetura

- **Monorepo Next.js 14 (App Router)** com fronteira clara entre app público (formulário) e painel admin.
- **Multitenant por linha**: toda tabela de negócio carrega `tenant_id`; isolamento garantido em camada de dados (Prisma middleware / RLS-like guard) e na sessão.
- **Provider pattern para canais**: interface única (`ChannelProvider`) com implementações Email (real), WhatsApp (real), SMS (mock→real), e fila assíncrona única.
- **IA isolada atrás de um serviço** (`AIService`) — troca de modelo/parametrização sem tocar nas rotas.
- **Processamento assíncrono** (análise IA, disparos, relatórios) via **fila Redis (BullMQ)** + worker dedicado.
- **Local-first**: tudo sobe com um `docker compose up`; segredos via `.env`. Deploy reaproveita o mesmo Compose + Traefik no VPS.
- **Type-safety ponta a ponta**: Prisma + Zod nos limites (forms, API, webhooks).

### Stack confirmada (do escopo)

Next.js 14 + TS · Tailwind + shadcn/ui · PostgreSQL 16 + Prisma · NextAuth v5 · Redis + BullMQ · MinIO (S3) · Nodemailer/SMTP · Claude API · Docker Compose · Traefik · GitHub Actions.

---

## 2. Estrutura do projeto (proposta)

```
pronto-satisfacao/
├── escopo-prontoclinica-survey.md
├── PLANO-DESENVOLVIMENTO.md
├── docker-compose.yml            # postgres, redis, minio, app, worker
├── docker-compose.prod.yml       # overrides + Traefik labels
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (public)/p/[slug]/    # formulário público
│   │   ├── (admin)/admin/        # painel (auth obrigatória)
│   │   ├── api/                  # rotas API + webhooks + v1 pública
│   │   └── api/docs/             # Swagger UI (OpenAPI)
│   ├── components/ui/            # shadcn
│   ├── modules/                  # lógica por domínio (auth, surveys, theme,
│   │   │                         #   channels, analytics, ai, reports, ...)
│   ├── lib/                      # prisma, redis, auth, tenant-guard, s3
│   ├── server/queues/            # definição de filas e jobs
│   └── workers/                  # processadores BullMQ (entrypoint do worker)
├── tests/                        # unit + integração + e2e (Playwright)
└── .github/workflows/            # CI (lint, test, build, push GHCR)
```

---

## 3. Modelo de dados (núcleo — Prisma)

Visão das entidades principais. Detalhamento de colunas vem no início de cada épico.

- **Tenant** — clínica (multitenant raiz).
- **User** — pertence a Tenant; `role` (SUPER_ADMIN, CLINIC_ADMIN, SECTOR_MANAGER, OPERATOR, VIEWER); vínculo opcional a Sectors.
- **Session / AuditLog / AccessLog** — auth, auditoria, 2FA (TOTP secret).
- **Sector** (especialidade/setor) e **TouchPoint** (ponto de contato) — configuráveis por tenant.
- **Survey** — pesquisa; status, slug, janela de tempo, limites, config (one-per-page, randomização, etc.), vínculos a Sectors e TouchPoints.
- **Question** — tipo (enum dos 12 tipos), ordem, obrigatoriedade, opções (JSON), config de escala.
- **SkipLogicRule** — condições (origin question, operador, valor, E/OU) → ação (mostrar/ocultar target).
- **Theme** — config visual (cores, tipografia, layout, CSS custom) por tenant e/ou por survey; presets.
- **Distribution** — instância de canal de uma survey (link/QR/email/sms/whatsapp/embed), slug/token, métricas.
- **Recipient / DispatchBatch / DispatchJob** — disparo em lote, status por destinatário, opt-out.
- **Response** — resposta submetida; metadados (canal, device, OS, browser, tempo, token paciente, consentimento LGPD).
- **Answer** — resposta por pergunta (valor tipado em JSON).
- **AIAnalysis** — sentimento/score/emoções por resposta; **Theme/TopicCluster** — temas agregados; **ExecutiveSummary** — resumos; **Alert** — alertas inteligentes.
- **Report / ReportSchedule / ReportRun** — relatórios e agendamentos.
- **Notification** — central de notificações.
- **ApiKey / WebhookEndpoint / WebhookLog** — integrações externas.

Todas (exceto Tenant) com `tenant_id`, `created_at`, `updated_at`, soft-delete onde fizer sentido.

---

## 4. Roadmap por fases, épicos e milestones

Sequenciamento pensado para entregar valor verificável a cada milestone. Cada milestone tem **critério de aceite** (DoD).

### FASE 0 — Fundação (pré-requisito de tudo)

**M0.1 — Bootstrap do projeto**

- `git init`, Next.js 14 + TS, Tailwind + shadcn, ESLint/Prettier, estrutura de pastas.
- `docker-compose.yml` local: Postgres 16, Redis 7, MinIO. `.env.example`.
- **DoD:** `docker compose up` sobe os serviços e o Next.js conecta no banco.

**M0.2 — Camada base de dados e multitenancy**

- Prisma schema inicial (Tenant, User, Sector, TouchPoint), migrations, seed.
- `tenant-guard`: middleware Prisma que injeta/valida `tenant_id` em toda query.
- **DoD:** seed cria tenant "Prontoclínica" + usuário super admin; query sem tenant é bloqueada.

**M0.3 — Esqueleto de filas e worker**

- BullMQ + Redis; processo `worker` no Compose; job "hello" de fumaça.
- **DoD:** job enfileirado pelo app é processado pelo worker.

---

### FASE 1 — MVP

**M1.1 — Autenticação e RBAC (Módulo 1)**

- NextAuth v5 (credenciais + bcrypt), recuperação de senha, rate-limit, 2FA TOTP opcional.
- Matriz RBAC dos 5 perfis aplicada em middleware de rota + guards de ação.
- Convite de usuários por email, ativação/desativação, audit log, access log.
- **DoD:** cada perfil acessa só o que a matriz do escopo (§3.1.2) permite; testes de autorização passando.

**M1.2 — Configurações da clínica (base do Módulo 9)**

- CRUD de Sectors, TouchPoints, dados da clínica, fuso `America/Fortaleza`.
- Upload de logo para MinIO.
- **DoD:** admin configura setores/pontos de contato; logo persiste e é servido.

**M1.3 — Construtor de pesquisas (Módulo 2)**

- Editor drag-and-drop 2 colunas (blocos | preview live).
- Os **12 tipos de pergunta** do escopo (§3.2.2).
- Skip logic visual (E/OU), config da pesquisa (§3.2.4), associação a setor/ponto de contato.
- **DoD:** criar uma pesquisa completa com skip logic e pré-visualizá-la fielmente.

**M1.4 — Personalização visual / Tema (Módulo 3)**

- Editor de tema com preview em tempo real, 5 presets + custom, color picker, tipografia (Google Fonts), layout, CSS avançado.
- Aplicação dos **ativos de marca** da Prontoclínica.
- **DoD:** tema configurado reflete no formulário público pixel-a-pixel.

**M1.5 — Formulário público (Módulo 5)**

- Render mobile-first, uma-por-página/todas, validação em tempo real, skip logic executada, salvar progresso local (offline parcial), anti-bot, WCAG AA.
- Captura de metadados (canal, device, tempo, token, consentimento).
- Estados especiais (encerrada / já respondeu / offline / erro).
- **DoD:** responder ponta a ponta gera Response+Answers; Lighthouse acessibilidade ≥ 90; carrega < 1.5s em 3G simulado.

**M1.6 — Canais MVP (Módulo 4 — parte)**

- Link direto (slug + token individual), QR Code (PNG/SVG/PDF, com logo, cores do tema, templates de impressão), Email (template HTML, agendamento, métricas abertura/clique, opt-out LGPD) via fila.
- **DoD:** disparar email de teste, abrir via QR e via link, métricas registradas.

**M1.7 — Dashboard e Analytics (Módulo 6)**

- KPIs (NPS, CSAT, volume, taxa de resposta, promotores/neutros/detratores).
- Gráficos: evolução NPS, distribuição 0–10, radar por ponto de contato, donut por canal, heatmap por especialidade.
- Feed de respostas recentes + filtros globais; análise por pesquisa; comparativo de períodos.
- Cache Redis (atualização ~5 min).
- **DoD:** dashboard reflete dados reais com todos os filtros funcionando.

**M1.8 — IA: sentimento + resumo executivo (Módulo 7 — parte)**

- `AIService` sobre Claude API; análise de sentimento assíncrona por resposta (badge inline + agregado).
- Resumo executivo automático (semanal/segunda) e sob demanda, com histórico.
- **DoD:** nova resposta textual recebe sentimento em < 30s; resumo gerado em linguagem natural.

**M1.9 — Relatórios (Módulo 8)**

- Geração PDF (com marca/tema) e Excel/CSV; os 7 tipos do escopo.
- Agendamento recorrente por email com filtros, destinatários, pausa/retomada, histórico, "enviar agora".
- **DoD:** relatório executivo PDF gerado < 10s e agendamento dispara via worker.

**M1.10 — Empacotamento MVP + deploy**

- `docker-compose.prod.yml` com labels Traefik + SSL; GitHub Actions (lint→test→build→GHCR); backup diário Postgres; headers de segurança/CSP/HSTS.
- **DoD:** MVP roda em produção sob HTTPS no domínio; pipeline verde.

---

### FASE 2 — Expansão

**M2.1 — WhatsApp (real) + SMS (mock→real)**

- `ChannelProvider` WhatsApp via Meta Cloud API (templates HSM, CTA button, janela 24h, webhook de status). SMS via provider abstrato (Zenvia/Twilio) com mock até credenciais.
- **DoD:** disparo WhatsApp real entregue e status atualizado; SMS via mock validado e pronto para plugar gateway.

**M2.2 — Disparo em lote (CSV/Excel)**

- Upload, mapeamento de colunas, validação/preview, agendamento, relatório de disparo.
- **DoD:** lote de 100+ destinatários processado pela fila com relatório de status.

**M2.3 — IA avançada: temas + nuvem de palavras**

- Clustering de temas recorrentes, volume e tendência, nuvem interativa, filtro por tema, alerta de tema emergente.
- **DoD:** feedbacks textuais agrupados em temas com tendência vs. período anterior.

**M2.4 — Alertas inteligentes + análise comparativa temporal (Módulo 7)**

- Alertas: detrator, tendência negativa, tema emergente, volume baixo; thresholds configuráveis; histórico.
- Narrativa de variações, sazonalidades e correlações via IA.
- **DoD:** detrator gera notificação imediata; thresholds configuráveis disparam corretamente.

**M2.5 — Central de notificações em tempo real (Módulo 10)**

- WebSocket, sino com badge, preferências por perfil, email opcional, marcar lido/arquivar.
- **DoD:** evento de detrator aparece em tempo real no painel.

**M2.6 — Widget embed (Módulo 4)**

- Snippet JS inline + popup flutuante.
- **DoD:** formulário embute em página externa de teste e submete normalmente.

**M2.7 — LGPD completo (Módulo 9)**

- Política exibida, coleta anônima, retenção/anonimização programada (job), log de consentimento, exportação e exclusão por paciente (direitos LGPD).
- **DoD:** exportar e apagar dados de um paciente; anonimização automática após retenção.

---

### FASE 3 — Integração e Escala

**M3.1 — API pública v1 + OpenAPI/Swagger**

- `GET/POST /api/v1/...`, autenticação por API Key, rate-limit, log de chamadas, Swagger UI em `/api/docs`.
- **DoD:** chamada autenticada por API Key lista/cria recursos; docs interativas no ar.

**M3.2 — Integração Amigo Tech**

- `POST /api/webhooks/amigo` (contrato + validação + assinatura), disparo automático de pesquisa pós-atendimento, webhooks de saída, teste com payload exemplo, log.
- Mock até docs reais; adaptador trocável.
- **DoD:** evento simulado do Amigo dispara pesquisa; webhook de saída notifica endpoint de teste.

**M3.3 — Multitenant operacional + Super Admin**

- Painel Super Admin cross-tenant, criação/gestão de tenants, billing/limites (se aplicável).
- **DoD:** dois tenants isolados coexistem; super admin transita entre eles.

**M3.4 — App mobile (React Native) — painel**

- Leitura de dashboard/notificações. (Escopo a refinar no início da fase.)

**M3.5 — Internacionalização (EN/ES)**

- i18n no painel e formulário público.

---

## 5. IA — estratégia técnica

- **Serviço único** `AIService` encapsula prompts, modelo (`claude-sonnet-4`), retries e custo.
- **Tudo assíncrono** via fila: resposta entra → job de análise → persiste `AIAnalysis`.
- **Prompts versionados** em arquivos (sentimento, extração de temas, resumo executivo, narrativa comparativa) — fáceis de iterar.
- **Custo/observabilidade**: log de tokens por job; cache de resultados; reprocessamento sob demanda.
- **Idioma**: PT-BR; saída estruturada (JSON) validada por Zod.

---

## 6. Integrações externas — provider pattern

- Interface `ChannelProvider { send(), getStatus() }`.
- Implementações: **Email** (Nodemailer/SMTP, real), **WhatsApp** (Meta Cloud, real), **SMS** (mock → Zenvia/Twilio).
- `WebhookAdapter` para Amigo Tech (mock → real) — contrato definido por nós e ajustado quando vierem as docs.
- Toda saída passa pela fila → idempotência + retry + status persistido.

---

## 7. Qualidade, testes e segurança

- **Testes:** unit (lógica de domínio: NPS, skip logic, RBAC), integração (rotas + Prisma em DB de teste), e2e (Playwright: criar pesquisa, responder, ver no dashboard).
- **CI:** lint + typecheck + testes + build em cada PR.
- **Segurança (do escopo §5):** HTTPS, rate-limit, sanitização (Prisma + Zod), CSP/HSTS/X-Frame, segredos fora do git, backup diário Postgres, audit log.
- **Acessibilidade:** checagem WCAG AA no formulário público (axe + Lighthouse no CI).

---

## 8. Métricas de sucesso (do escopo §8) como metas de aceite

Carregamento < 1.5s em 3G · PDF < 10s · IA por resposta < 30s · uptime ≥ 99.5% (pós-deploy) — viram checks nos milestones correspondentes.

---

## 9. Riscos e mitigações

| Risco                                             | Mitigação                                                       |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Templates WhatsApp HSM dependem de aprovação Meta | Começar aprovação cedo; usar sandbox/mocks até liberar          |
| Docs Amigo Tech indisponíveis                     | Definir contrato próprio + adaptador trocável                   |
| Custo/latência da IA                              | Fila assíncrona, cache, batching, monitor de tokens             |
| Complexidade do construtor drag-and-drop          | Entregar tipos de pergunta incrementalmente; preview desde cedo |
| Multitenant vazando dados                         | Guard central + testes de isolamento obrigatórios               |

---

## 10. Ordem de execução recomendada

`Fase 0 → M1.1 … M1.10 (MVP em produção) → Fase 2 → Fase 3`.
Cada milestone é um conjunto de PRs pequenos e revisáveis, com seu DoD verificado antes de seguir.

---

## Próximo passo

Revise este plano. Quando aprovar, começo pela **Fase 0 (Bootstrap + base de dados + filas)** e sigo milestone a milestone, pausando para sua validação ao fim de cada um. Se quiser ajustar prioridade, escopo de algum módulo ou o sequenciamento, me diga antes de eu iniciar.
