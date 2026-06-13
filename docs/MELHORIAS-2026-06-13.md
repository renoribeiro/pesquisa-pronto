# Pronto Satisfação — Plano de Melhorias para ser o melhor do mercado

**Data:** 2026-06-13
**Base:** auditoria completa ([AUDITORIA-2026-06-13.md](AUDITORIA-2026-06-13.md)) + correções já aplicadas.
**Contexto:** o produto já tem fundação sólida (multitenant, RBAC, filas, IA, LGPD básico). Este documento aponta onde investir para virar referência em **gestão de experiência do paciente (PXM)** no setor de saúde brasileiro — concorrendo com Track.co, SoluCX, Medallia/Qualtrics.

> Legenda de esforço/impacto: 🟢 quick win · 🟡 médio · 🔵 estratégico.

---

## 1. O fosso competitivo: IA aplicada à saúde

Hoje a IA faz sentimento + emoções + resumo executivo + embeddings. Isso é paridade, não diferenciação. Para liderar:

- 🔵 **Clustering de temas com os embeddings que já gravamos.** O `pgvector(1536)` está populado mas o `extract-topics` é stub. Implementar agrupamento (k-means/HDBSCAN sobre os embeddings, ou `<->` do pgvector) com rótulo gerado por Claude, tendência vs. período anterior e nuvem de palavras interativa. É o item de maior ROI: transforma texto livre em pauta de gestão.
- 🔵 **Alertas preditivos, não só reativos.** Hoje o alerta de detrator é pós-fato. Usar a série temporal de NPS + sentimento para prever queda (tendência negativa por setor/médico) antes de virar crise. O `AlertType.NEGATIVE_TREND` já existe no schema mas não é disparado.
- 🟡 **"Pergunte aos seus dados" (RAG).** Chat executivo sobre as respostas usando os embeddings: "o que os pacientes da cardiologia mais reclamam este mês?". Diferencial enorme para gestores não-técnicos.
- 🟡 **Análise por entidade clínica.** Extrair de comentários menções a médico/setor/procedimento e cruzar com NPS — "Dr. X tem NPS 30 pts acima da média". Cuidar de LGPD/uso responsável.
- 🟢 **Sugestão de ação no close-loop.** Quando abre alerta de detrator, a IA já sugere a mensagem de retorno ao paciente (rascunho editável), acelerando o ciclo.
- 🟢 **Observabilidade de custo de IA.** Logar tokens/custo por job (o plano previa, não foi feito) e cache de resultados — controla margem ao escalar.

## 2. Experiência do respondente = taxa de resposta (a métrica que vende)

Em pesquisa, a taxa de resposta é o produto. Melhorias diretas:

- 🔵 **PWA/offline real + retomar depois.** Já há draft em localStorage; evoluir para service worker (responder sem rede na recepção da clínica e sincronizar depois).
- 🟡 **Pesquisa conversacional (estilo chat) opcional.** Para WhatsApp e mobile, um modo "uma pergunta por bolha" converte mais que formulário tradicional.
- 🟡 **A/B testing de pesquisas.** Testar variações de pergunta/ordem/canal e medir conversão — vira argumento comercial.
- 🟢 **Acessibilidade verificável no CI.** O escopo exige WCAG AA e Lighthouse ≥ 90; adicionar `axe`/Lighthouse CI ao pipeline para garantir e exibir como selo.
- 🟢 **Microcopy e tempo estimado.** Mostrar "leva ~1 min", barra de progresso por seção, salvar automático visível — reduz abandono.
- 🟢 **i18n** (PT/EN/ES) no formulário público — relevante para clínicas com público estrangeiro e para expansão.

## 3. Segurança & compliance — inegociável em saúde (dados sensíveis LGPD)

Vários itens já foram corrigidos na auditoria. Próximos passos para nível "enterprise/hospitalar":

- 🔵 **Cifrar segredos em repouso:** `totpSecret`, `WebhookEndpoint.secret`, tokens de canal. Hoje em texto puro (flagged). AES-GCM com chave fora do banco.
- 🔵 **Revalidação de sessão (tokenVersion).** JWT atual não invalida ao desativar usuário/trocar senha (TODO já marcado em `auth.config.ts`). Implementar `tokenVersion` no User + checagem no callback `jwt`.
- 🔵 **Anonimização/retenção automática (LGPD Fase 2.7).** `retentionMonths` é coletado mas não há job que anonimize/expurgue. Implementar job agendado + exportação e exclusão por paciente (direitos do titular). É requisito legal e diferencial de venda para hospitais.
- 🟡 **CSP/HSTS/headers de segurança** no `next.config`/middleware (o escopo exige; reforça defesa contra a injeção de CSS/HTML já mitigada).
- 🟡 **Idempotência atômica de webhooks.** A checagem atual do webhook Amigo Tech tem janela de corrida; adicionar `WebhookEndpoint`/`WebhookLog` com índice único `[tenantId, externalEventId]` via migration.
- 🟡 **Trilha de auditoria imutável + exportável.** Já existe `AuditLog`; expor relatório de auditoria e considerar retenção/append-only para conformidade.
- 🟢 **Política de senha forte + verificação de vazamento** (zxcvbn / HIBP) no reset.
- 🟢 **Teste automatizado de isolamento multitenant e de setor** no CI (o `forTenant` agora deriva de DMMF; adicionar teste que prova que setor A não vê dados do setor B — fecha a regressão H1 permanentemente).

## 4. Escala & performance multitenant

- 🔵 **Postgres RLS como segunda camada** além do `forTenant`. Defesa em profundidade real: mesmo um bug de aplicação não vaza entre tenants. Política `tenant_id = current_setting('app.tenant_id')`.
- 🟡 **Agregados materializados para o dashboard.** Hoje o NPS recalcula somando todas as respostas a cada visita. Em volume, usar views materializadas / tabela de rollup diário + cache Redis (o plano previa cache ~5 min) — dashboards instantâneos.
- 🟡 **Paginação por cursor** nas listagens de respostas (offset degrada com volume).
- 🟢 **Worker em runtime compilado.** `Dockerfile.worker` roda TS via `tsx` (devDependency) em produção — compilar para JS (tsup/esbuild) reduz footprint e risco.
- 🟢 **Índices compostos** para os filtros mais comuns (`[tenantId, completed, createdAt]`, `[tenantId, npsScore]`).

## 5. Confiabilidade & operação

- 🔵 **Observabilidade.** Sentry (erros), métricas de fila (jobs/falhas/latência), tracing. Hoje o worker usa `console`; padronizar no `logger` e exportar.
- 🟡 **Dead-letter queue + painel de jobs.** Após o fix de retry (H4), expor jobs FAILED para reprocessamento manual (Bull Board) e reconciliação dos contadores de batch.
- 🟡 **Health checks ricos + uptime.** `/api/health` já checa PG/Redis; adicionar MinIO e profundidade das filas; alertar em degradação.
- 🟡 **Backup diário do Postgres + restore testado** (escopo M1.10) e DR documentado.
- 🟢 **CI completo:** lint + typecheck + test + build + axe + (futuro) e2e Playwright em cada PR; já há `.github/` — garantir os gates verdes obrigatórios.

## 6. Produto, analytics & close-loop (onde se ganha o cliente)

- 🔵 **Close-loop como fluxo de 1ª classe.** Hoje detrator vira alerta + WhatsApp. Evoluir para caso com status (aberto→em tratativa→resolvido), responsável, SLA, histórico de contato e medição de recuperação. É o coração de um PXM.
- 🟡 **Benchmarks e metas.** NPS vs. meta, vs. período, vs. benchmark de setor; segmentação por unidade/especialidade/médico/convênio.
- 🟡 **Notificações em tempo real (M2.5).** WebSocket + sino — detrator aparece na hora no painel.
- 🟡 **App mobile do gestor (M3.4)** para dashboard/alertas — reforça o close-loop fora do desktop.
- 🟢 **Relatórios PDF com marca** (hoje Excel/CSV/texto; o PDF executivo com tema é entregável de alto valor percebido).
- 🟢 **Exportação agendada e "enviar agora"** (M1.9) — já há base de relatórios/worker.

## 7. Integrações & go-to-market

- 🔵 **Disparo automático pós-atendimento via Amigo Tech** (M3.2): o webhook já existe; transformar em gatilho configurável (por setor/procedimento, janela de tempo, canal preferido). É o que torna a coleta contínua e sem trabalho manual — principal dor das clínicas.
- 🟡 **API pública v1 + Swagger** já existem; publicar docs, versionar, adicionar webhooks de saída (eventos: nova resposta, detrator) para integrar com CRM/BI da clínica.
- 🟡 **Catálogo de templates de pesquisa** prontos para saúde (pós-consulta, pós-exame, internação, NPS relacional) — reduz time-to-value do cliente novo.
- 🟢 **Multi-unidade/rede.** O multitenant já suporta; adicionar hierarquia "rede → unidades" para grupos clínicos (comparar unidades) é upsell natural.

## 8. Qualidade de engenharia (sustentar a velocidade)

- 🟡 **Cobertura de testes nos fluxos críticos:** submissão de resposta (anti-IDOR, limite, rate-limit), disparo/retry, RBAC por setor, skip logic. Hoje há 16 testes (bom começo); mirar os caminhos de dinheiro/segurança.
- 🟡 **E2E Playwright:** criar pesquisa → responder → ver no dashboard (o escopo previa).
- 🟢 **Validação de payload do builder no servidor** com schema tipado (reduz casts no renderer).
- 🟢 **Padronizar `forTenant` em 100% da lógica de aplicação** (alguns workers ainda usam client base por motivos pontuais) e o teste de paridade DMMF garante a lista sempre correta.

---

## Sequência sugerida (90 dias)

1. **Mês 1 — Confiança & compliance:** RLS + cifra de segredos + tokenVersion + retenção/anonimização LGPD + observabilidade (Sentry) + CI com gates. *(vende para hospitais)*
2. **Mês 2 — Diferenciação por IA:** clustering de temas (usar embeddings já gravados) + nuvem de palavras + alerta de tendência + custo de IA. *(vira referência)*
3. **Mês 3 — Coleta contínua & close-loop:** gatilho automático Amigo Tech + close-loop com SLA + tempo real + PDF com marca + benchmarks. *(retém e expande)*

> Tudo acima é incremental sobre a arquitetura atual — não requer reescrita. O maior multiplicador é **ativar os embeddings que já estão sendo gerados** (clustering/RAG) e **fechar o ciclo LGPD/segurança** para destravar o mercado hospitalar.
