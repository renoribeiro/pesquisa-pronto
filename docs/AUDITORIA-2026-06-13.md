# Auditoria Completa — Pronto Satisfação

**Data:** 2026-06-13
**Método:** leitura integral arquivo a arquivo (116 arquivos TS/TSX + schema/seed/configs) por 10 agentes auditores em paralelo, seguida de **verificação adversarial** dos achados de alta severidade.
**Totais:** 112 achados brutos · 23 critical/high checados · **13 confirmados** (severidade recalibrada) · **5 falsos positivos** derrubados · ~89 medium/low.

---

## 1. Veredito geral

A aplicação está **madura e bem arquitetada** para o estágio: multitenancy por linha com guard central (`forTenant`), RBAC declarativo, filas/worker isolados, validação Zod nos limites, anti-IDOR no formulário público, rate-limit, 2FA TOTP, auditoria. **Nenhum vazamento cross-tenant ativo** foi confirmado — o isolamento por tenant funciona na prática (inclusive a verificação confirmou que o `forTenant` usa corretamente o *extendedWhereUnique* do Prisma 6).

Os problemas reais concentram-se em: **(a)** escopo de setor do RBAC não aplicado, **(b)** skip logic numérica quebrada, **(c)** retries de disparo inócuos, **(d)** uma aba de configuração que apaga dados, **(e)** injeção de HTML/CSS em e-mails e formulário público, e **(f)** aderência inconsistente à convenção `forTenant` em workers/actions (defesa-em-profundidade).

---

## 2. Mapa de funcionalidades (o que a aplicação faz)

- **Auth/RBAC:** NextAuth v5 (JWT) com login por credenciais multitenant, 2FA TOTP, reset de senha com token opaco (SHA-256), matriz RBAC de 5 perfis × 5 permissões, API key Bearer, middleware edge (`proxy.ts`).
- **Multitenancy:** `forTenant(tenantId)` estende o Prisma e injeta/filtra `tenantId` em ~30 modelos; client base reservado a operações cross-tenant; auditoria/access log.
- **Surveys:** builder drag-and-drop (dnd-kit) com 12 tipos de pergunta, skip logic visual (E/OU), preview ao vivo; ciclo DRAFT→PUBLISHED→CLOSED→ARCHIVED; cálculo de NPS.
- **Formulário público + embed:** multi-página, atalhos de teclado, draft em localStorage, consentimento LGPD, honeypot, tema via CSS vars; submissão com anti-IDOR, rate-limit, hash de IP, anti-TOCTOU no limite de respostas.
- **Canais/disparo:** provider pattern Email (Nodemailer) / WhatsApp (Meta Cloud) / SMS (mock→Zenvia); disparo em lote via fila; QR code.
- **Filas/workers:** 6 filas BullMQ, worker separado, processadores de IA, relatórios, dispatch, email.
- **IA/analytics:** sentimento + emoções + embeddings pgvector (OpenAI), resumo executivo (Claude), dashboard NPS/CSAT, alertas de detrator com close-loop por WhatsApp.
- **Relatórios:** geração assíncrona Excel/CSV/PDF para MinIO com URL assinada.
- **Admin:** temas/marca, configurações da clínica + LGPD, gestão de usuários, super admin cross-tenant.
- **API pública v1 + OpenAPI/Swagger + webhook Amigo Tech** (HMAC).

---

## 3. Achados confirmados (verificação adversarial) — com plano de correção

> Severidade já **recalibrada** pela verificação. Prioridade de implementação: P1 (alto) → P3 (baixo).

### 🔴 P1 — Alta severidade (impacto funcional/segurança real)

**H1. Escopo `sector` do RBAC não é aplicado — vazamento entre setores** · `multitenancy` · `src/lib/session.ts`, `src/lib/rbac.ts`
`can()` colapsa `sector` e `all` em `true`; `requirePermission` devolve `db` isolado só por tenant. Um `SECTOR_MANAGER` vê/exporta dados de **todos** os setores (responses/page, analytics/queries, reports/actions).
**Fix:** `requirePermission` retorna também `scope = scopeOf(role, perm)`. Criar helper `sectorScopedWhere(ctx, scope)` que, quando `scope==='sector'`, filtra via relação N-N: Survey → `sectors: { some: { id: { in: ctx.sectorIds } } }`; Response/Answer/AIAnalysis → `survey: { sectors: { some: ... } }`. `sectorIds` vazio = nada visível. Aplicar em queries.ts, responses/page.tsx, reports/actions.ts (+ worker), analytics/actions.ts. Adicionar testes de isolamento por setor.

**H2. Connect/set por id aceita ids cross-tenant** · `multitenancy` · `src/modules/users/actions.ts:47`, `src/modules/surveys/actions.ts:144-145`
`sectors: { connect/set: ids }` sem validar que os Sector/TouchPoint pertencem ao tenant.
**Fix:** antes de conectar, validar via `forTenant`: `const n = await db.sector.count({ where: { id: { in: ids } } }); if (n !== ids.length) throw`. Idem touchPoints. Migrar esses módulos para `forTenant`. (Hardening adicional opcional: travessia recursiva no guard.)

**H3. Skip logic numérica quebrada (eq/neq compara number vs string)** · `correctness` · `src/modules/surveys/logic.ts:59-62`
NPS/escala/emoji são `number`; o `value` da condição vem do builder como `string`. `6 === "6"` é `false` → regras de igualdade nunca casam (o clássico "mostrar X quando NPS = 10" não funciona).
**Fix:** `looseEq(a,b)` coercivo numérico com guarda `a!=="" && b!==""`; aplicar em `eq`/`neq`/`in`. (Detalhe no relatório original.)

**H4. Retries do BullMQ inócuos — job FAILED nunca reprocessa** · `correctness` · `src/workers/processors/dispatch.ts:28`
O guard `if (status !== "PENDING") return null` aborta a 2ª/3ª tentativa, pois a 1ª já marcou FAILED. Falha transitória do provider = envio perdido apesar de `attempts:3`.
**Fix:** aceitar `["PENDING","SENDING","FAILED"]` como reprocessáveis; só persistir FAILED na última tentativa (`job.attemptsMade + 1 >= job.opts.attempts`); contar `batch.failed` só na falha final. Propagar `job` até `sendDispatchJob`. Cuidar de idempotência no canal EMAIL.

**H5. `acknowledgeAlert` autoriza por `survey:view` — VIEWER fecha alertas** · `security` · `src/modules/alerts/actions.ts:122`
Mutação de gestão (silenciar detrator) acessível ao perfil read-only.
**Fix:** adicionar permissão `alert:manage` à matriz RBAC (SUPER_ADMIN/CLINIC_ADMIN/SECTOR_MANAGER = sim; OPERATOR/VIEWER = none); exigir em `acknowledgeAlert`; esconder o controle no UI; teste RBAC.

**H6. Aba LGPD/Privacy apaga dados de contato da clínica** · `data-integrity` · `src/modules/settings/components/settings-client.tsx:142-170` + `src/modules/settings/actions.ts:24-35`
A aba Privacy reusa `onClinicSubmit` mas só envia `name/timezone/retentionMonths/privacyPolicy`; `updateClinic` faz `contactEmail || null` → **apaga** email/telefone/endereço a cada salvamento da aba LGPD.
**Fix (preferido):** action dedicada `updatePrivacy` que só toca `privacyPolicy/retentionMonths`; aba Privacy usa essa action. (Alternativa: `updateClinic` omitir campos `undefined`.)

### 🟠 P2 — Média severidade (segurança secundária / robustez)

**M1. Login/reset case-sensitive no e-mail** · `src/auth.ts`, `src/modules/auth/actions.ts`, `src/modules/users/actions.ts`, `prisma/seed.ts`
**Fix:** `z.string().email().transform(e => e.trim().toLowerCase())` em credentialsSchema/requestSchema/inviteSchema; normalizar na gravação (seed/invite); backfill `lower(email)`; opcional citext/índice funcional.

**M2. Injeção de CSS (`customCss`) sem sanitização no formulário público** · `security` · `src/modules/responses/components/public-form.tsx:478-480` + `src/modules/themes/components/theme-editor.tsx:246` + `src/modules/themes/theme-config.ts:27`
CSS arbitrário de admin de tenant renderizado em página pública: exfiltração via `url()`/seletores de atributo, UI-redress/clickjacking. (React já neutraliza breakout de `<style>` → não é XSS de script.)
**Fix:** escopar todo seletor a `[data-survey-wrapper]` via parser (postcss) no servidor; rejeitar `@import`/`url(`/`expression`/`:root`/`html`/`body`/`*`; validar no schema e no server action. Aplicar mesma sanitização no preview do editor.

**M3. HTML injection no e-mail de disparo** · `security` · `src/workers/processors/dispatch.ts:118-135`
`name`/`title` interpolados sem escape no HTML.
**Fix:** helper `escapeHtml` em todas as interpolações; `encodeURI`+validação de esquema http(s) no href.

**M4. HTML injection no e-mail do webhook Amigo Tech** · `security` · `src/app/api/webhooks/amigo-tech/route.ts:118-140`
**Fix:** mesmo `escapeHtml` em `title`/`name`; `encodeURIComponent` no slug.

**M5. HTML injection nos e-mails de reset/convite** · `security` · `src/modules/auth/emails.ts:33-46`
**Fix:** `escapeHtml(name)`; escapar/encodar `url` em `button()`.

**M6. `createSurvey` usa client base em vez de `forTenant`** · `multitenancy` · `src/modules/surveys/actions.ts:86`
**Fix:** usar `db` de `requirePermission`. (`uniqueSlug` mantém client base — busca global intencional.)

**M7. `saveSurvey` usa client base + transação fora do guard** · `multitenancy` · `src/modules/surveys/actions.ts:110`
**Fix:** `db.$transaction(...)` a partir do `forTenant`.

**M8. Worker de IA usa client base** · `multitenancy` · `src/workers/processors/ai.ts`
**Fix:** `const db = forTenant(tenantId)` em `analyzeResponse`/`generateSummary`; manter raw SQL do embedding com `AND tenantId`.

**M9. Outros confirmados medium (do pool de leitura, alta confiança):**
- Rate limiter janela-fixa não-atômico (`src/lib/rate-limit.ts`) → usar `MULTI`/Lua ou setar EXPIRE só na 1ª req.
- `message.content[0]` sem checar array vazio (`src/lib/ai.ts:75,116`).
- Prompt injection: respostas de pacientes cruas no prompt do Claude (`src/lib/ai.ts`) → delimitar/instruir.
- Webhook Amigo Tech sem idempotência (`appointment.id` duplicado reenvia e-mail).
- `uploadLogo` aceita qualquer tipo/extensão e usa `file.type` como ContentType (`src/modules/settings/actions.ts:40-53`) → allowlist de MIME/magic bytes.
- Credenciais default de MinIO embutidas no código (`src/lib/storage.ts`) → exigir via env.
- Senha default fraca de super admin com fallback fixo no seed (`prisma/seed.ts`).
- `audit`/`logAccess` engolem erros silenciosamente (`src/lib/audit.ts`).
- JWT sem revalidação contra DB: usuário desativado/role alterada continua válido (`src/auth.config.ts`) → `tokenVersion`.
- Reset não invalida tokens anteriores nem revoga sessões (`src/modules/auth/actions.ts`).
- TOTP secret em texto puro no banco (`schema.prisma:217`) → AES-GCM.
- `sentCount` incrementado no enfileiramento, não no envio (`src/modules/channels/actions.ts`).
- Parsing de destinatário trata "nome sem email" como email, quebrando o lote (`distribution-panel.tsx`).
- URL assinada de relatório (TTL 7d) persistida em `fileUrl` (`reports.ts`) → gerar sob demanda.
- `inviteUser`/`updateUserRole` não checam pertencimento de setores ao tenant; sem proteção de último admin / auto-rebaixamento (`src/modules/users/actions.ts`).
- Geração de `value` de opção a partir do label causa colisões/values vazios (`survey-builder.tsx`).
- Config bruto não validado do builder; casts inseguros no renderer (`surveys/actions.ts` + `question-renderer.tsx`).
- `contains` com value undefined → `String(undefined)` casa errado (`logic.ts`).
- Survey com slug duplicado servida ambiguamente (`p/[slug]/page.tsx`).
- API v1 `/surveys` ignora janela `opensAt/closesAt`.
- `updateTheme` por `{id}` (multitenancy — válido sob extendedWhereUnique, mas alinhar a `forTenant`).
- `retentionMonths/timezone` regridem a default na aba LGPD (relacionado a H6).
- Modelo `Tenant` acessível sem escopo via `forTenant` (`tenant.ts`) e `TENANT_MODELS` é lista manual → gerar via DMMF + teste de paridade.

### 🟡 P3 — Baixa severidade / hardening / DX

Workers (`ai.ts`, `reports.ts`, `dispatch.ts`, `alerts/actions.ts`) usam client base em vez de `forTenant` (defesa-em-profundidade; sem vazamento ativo). Embedding raw SQL sem `tenantId`. Open redirect via `redirectUrl` da survey. Hash de IP truncado (20 hex). URL com token enviada ao serviço externo de QR. Swagger/CDN sem SRI. `ThemeProvider` ausente (dark mode é código morto). KPI "Pesquisas Ativas" conta todas. Atalho de teclado impede NPS=10. `remotePatterns` só localhost:9000 (quebra em prod). Worker depende de `tsx` (devDep) em runtime. Dashboard admin sem checagem de permissão por papel. Iniciais do UserMenu quebram com espaços. Lógica TLS SMTP só cobre 465. Recipients duplicados a cada disparo. Sem isolamento de erro por destinatário no loop. Variáveis WhatsApp dependem da ordem de chaves. `intensity` da IA não clampada. `@ts-expect-error` no `groupBy`. E demais itens de robustez/tipos listados no anexo.

---

## 4. Falsos positivos derrubados na verificação (transparência)

Todos pela mesma premissa **incorreta** de que o Prisma rejeitaria `tenantId` num `where` de `findUnique/update/delete`. Na verdade o **extendedWhereUnique** (GA desde Prisma 5, padrão no 6.19) aceita campos escalares adicionais — e é justamente o que faz `forTenant` isolar `update/delete` por id com segurança (registro de outro tenant → P2025).

1. `findUnique` quebra em runtime com `tenantId` — **falso**.
2. `upsert` rejeita `tenantId` no where / vaza no update — **falso**.
3. `update/delete` com where unique falha ao mesclar `tenantId` — **falso**.
4. `acknowledgeAlert` update falha/não escopa — **falso**.
5. `deleteTheme` não valida tenant — **falso** (o guard já escopa; resíduo: P2025 não tratado = melhoria DX low).

---

## 5. Plano de implementação (ondas, partição por arquivo)

1. **Fundação compartilhada (sequencial):** `rbac.ts` (+`alert:manage`), `session.ts` (retornar `scope` + helper de setor), `tenant.ts` (DMMF + hardening), novo `src/lib/html.ts` (`escapeHtml`).
2. **Fan-out por módulo (paralelo, sem dois agentes no mesmo arquivo):** auth/users · surveys/logic · public-form/responses · channels/dispatch/mailer · ai/analytics/alerts · reports/themes/settings · api/webhooks · infra (rate-limit/storage/env/seed/config).
3. **Verificação:** `npm run typecheck && lint && test`; corrigir regressões; adicionar testes (sector scope, alert:manage, skip logic numérica, retry de dispatch).

> Itens que são **decisão de produto** (não bug) ficam com default seguro e nota: VIEWER poder exportar (`survey:export=all`), política de complexidade de senha, remover vs sanitizar `customCss`.
