# ESCOPO COMPLETO — Sistema de Pesquisa de Satisfação

## Prontoclínica de Fortaleza

**Versão:** 1.0 — Junho/2026  
**Elaborado por:** RE9 Online Branding Ltda  
**Status:** Brainstorm Aprovado — Pré-Desenvolvimento

---

## 1. VISÃO GERAL DO PROJETO

### 1.1 Descrição

Desenvolvimento de uma aplicação web completa de **pesquisa de satisfação, NPS (Net Promoter Score), coleta de feedbacks, sugestões e críticas** para a Prontoclínica de Fortaleza. O sistema permitirá à clínica medir e acompanhar a experiência do paciente em todos os pontos de contato da jornada de atendimento, com análise inteligente via IA, relatórios automatizados e disparos multicanal.

### 1.2 Objetivos Estratégicos

- Capturar a voz do paciente em todos os momentos da jornada de atendimento
- Identificar pontos críticos de melhoria por especialidade e setor
- Gerar inteligência acionável para a gestão da clínica via IA
- Automatizar o ciclo de coleta → análise → relatório → ação
- Construir um histórico longitudinal de satisfação para suporte a decisões estratégicas

### 1.3 Público-Alvo da Aplicação

| Perfil              | Descrição                                                        |
| ------------------- | ---------------------------------------------------------------- |
| **Pacientes**       | Respondem às pesquisas via QR Code, link, WhatsApp, Email ou SMS |
| **Administradores** | Gestores da clínica que criam e analisam pesquisas               |
| **Super Admin**     | Equipe RE9 com acesso total ao sistema                           |

---

## 2. ARQUITETURA TÉCNICA

### 2.1 Stack Tecnológico

| Camada              | Tecnologia                             | Justificativa                                          |
| ------------------- | -------------------------------------- | ------------------------------------------------------ |
| **Frontend**        | Next.js 14 (App Router) + TypeScript   | SSR nativo, SEO, performance em formulários públicos   |
| **Estilização**     | Tailwind CSS + shadcn/ui               | Componentização consistente e design system robusto    |
| **Backend/API**     | Next.js API Routes + Node.js           | Monorepo simplificado, menos infra para manter         |
| **Banco de Dados**  | PostgreSQL 16 (via Docker)             | Relacional, robusto para dados de pesquisa e analytics |
| **ORM**             | Prisma                                 | Type-safe, migrations automáticas, DX excelente        |
| **Autenticação**    | NextAuth.js v5                         | Multi-provider, sessões seguras, RBAC nativo           |
| **Cache/Filas**     | Redis (via Docker)                     | Cache de dashboards, filas de disparo de mensagens     |
| **Email**           | Nodemailer + SMTP Hostgator            | Consistente com infraestrutura RE9 existente           |
| **Armazenamento**   | MinIO (Docker)                         | Compatível S3, para logos, temas e exports             |
| **IA/NLP**          | Anthropic Claude API (claude-sonnet-4) | Análise de sentimento, resumos, extração de temas      |
| **Containerização** | Docker Compose                         | Consistente com infra VPS Hostinger existente          |
| **Proxy Reverso**   | Traefik                                | Já em uso no VPS, SSL automático via Let's Encrypt     |
| **CI/CD**           | GitHub Actions → GHCR                  | Padrão já estabelecido nos projetos RE9                |

### 2.2 Infraestrutura (VPS Hostinger)

```
VPS Hostinger
├── Traefik (proxy reverso + SSL)
├── prontoclinica-survey (Next.js app)
├── prontoclinica-db (PostgreSQL 16)
├── prontoclinica-redis (Redis 7)
├── prontoclinica-minio (MinIO)
└── prontoclinica-worker (Node.js — filas de disparo)
```

**Domínio sugerido:** `pesquisa.prontoclinicafortaleza.com.br`  
**Painel Admin:** `pesquisa.prontoclinicafortaleza.com.br/admin`

### 2.3 Arquitetura Multitenant

Embora o sistema seja inicialmente para a Prontoclínica, a arquitetura será construída com isolamento por `tenant_id` em todas as tabelas, permitindo expansão futura para outros clientes sem refatoração.

### 2.4 Integração Futura — Amigo Tech

O sistema terá desde o MVP:

- **Endpoint de webhook:** `POST /api/webhooks/amigo` — recebe eventos de atendimento concluído do Amigo Tech e dispara pesquisas automaticamente
- **API REST pública:** `GET/POST /api/v1/...` — permite que o Amigo Tech ou qualquer sistema externo consulte e interaja com o sistema
- **Documentação OpenAPI 3.0** gerada automaticamente (Swagger UI)
- Autenticação via **API Key** para integrações externas

---

## 3. MÓDULOS DA APLICAÇÃO

---

### MÓDULO 1 — AUTENTICAÇÃO E GESTÃO DE USUÁRIOS

#### 3.1.1 Sistema de Autenticação

- Login com email + senha (com hash bcrypt)
- Recuperação de senha via email com token temporário
- Sessões seguras com refresh token automático
- Proteção contra brute force (rate limiting por IP)
- 2FA opcional via TOTP (Google Authenticator)
- Logs de acesso (IP, dispositivo, data/hora)

#### 3.1.2 Hierarquia de Permissões (RBAC)

| Perfil                 | Criar Pesquisa |   Ver Resultados    |   Exportar   | Configurar Sistema | Gerenciar Usuários |
| ---------------------- | :------------: | :-----------------: | :----------: | :----------------: | :----------------: |
| **Super Admin**        |       ✅       | ✅ Todos os tenants |      ✅      |         ✅         |         ✅         |
| **Admin da Clínica**   |       ✅       |  ✅ Toda a clínica  |      ✅      |     ✅ Parcial     |     ✅ Parcial     |
| **Gestor de Setor**    |  ✅ Seu setor  |   ✅ Só seu setor   | ✅ Seu setor |         ❌         |         ❌         |
| **Atendente/Operador** |       ❌       |         ❌          |      ❌      |         ❌         |         ❌         |
| **Visualizador**       |       ❌       |    ✅ Read-only     |      ✅      |         ❌         |         ❌         |

#### 3.1.3 Gestão de Usuários

- Cadastro por convite (admin envia link por email)
- Definição de perfil e setor no momento do convite
- Ativação/desativação de usuários sem exclusão
- Histórico de ações por usuário (audit log)
- Gestão de setores/departamentos vinculados a cada usuário

---

### MÓDULO 2 — CONSTRUTOR DE PESQUISAS

#### 3.2.1 Visão Geral

Editor visual drag-and-drop completo para criação de pesquisas, seguindo o padrão SurveyMonkey. Interface em duas colunas: painel de blocos à esquerda e preview da pesquisa à direita em tempo real.

#### 3.2.2 Tipos de Perguntas Suportadas

| Tipo                                 | Descrição                                                                                                 | Exemplo de Uso                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **NPS Clássico**                     | Escala 0–10 com rótulos "Nada provável" / "Muito provável" + pergunta aberta de justificativa condicional | "Com que probabilidade recomendaria a Prontoclínica?"         |
| **Escala de Estrelas**               | 1 a 5 estrelas, animação de preenchimento ao hover                                                        | "Como avalia o atendimento médico?"                           |
| **Emoticons/Emojis**                 | 3, 4 ou 5 ícones expressivos configuráveis                                                                | 😞 😐 😊 😁                                                   |
| **Múltipla Escolha**                 | Seleção única ou múltipla, com opção "Outro (especifique)"                                                | "Como você chegou à Prontoclínica?"                           |
| **Caixa de Texto Livre**             | Campo aberto, curto (1 linha) ou longo (textarea)                                                         | "Deixe seu comentário ou sugestão"                            |
| **Escala Numérica**                  | Escala configurável (1–5, 1–7, 1–10) com rótulos nas extremidades                                         | "De 1 a 7, avalie a limpeza das instalações"                  |
| **Matriz de Avaliação**              | Grade com linhas (itens) e colunas (escala)                                                               | Avaliar recepção, limpeza, médico e espera numa tabela        |
| **Caixa de Seleção**                 | Lista de opções com checkboxes, limite configurável de seleções                                           | "Quais serviços utilizou hoje?"                               |
| **Menu Suspenso (Dropdown)**         | Seleção de uma opção em lista longa                                                                       | "Qual especialidade você consultou?"                          |
| **Data/Hora**                        | Seletor de data, hora ou ambos                                                                            | "Qual a data do seu atendimento?"                             |
| **Avaliação por Estrelas com Texto** | Estrelas + campo de justificativa obrigatório/opcional                                                    |                                                               |
| **Pergunta de Ranking**              | Ordenar itens por preferência arrastando                                                                  | "Ordene por importância: Tempo de espera, Limpeza, Médico..." |

#### 3.2.3 Lógica Condicional (Skip Logic)

- Mostrar/ocultar perguntas baseado em respostas anteriores
- Ex: Se NPS ≤ 6 → mostrar "O que poderíamos ter feito melhor?"
- Ex: Se NPS ≥ 9 → mostrar "O que mais te agradou?"
- Ex: Se "Utilizou o Day Hospital" = Sim → mostrar bloco de perguntas sobre internação
- Configuração visual com editor de regras (sem código)
- Suporte a múltiplas condições (E/OU)

#### 3.2.4 Configurações da Pesquisa

- **Título e descrição** da pesquisa
- **Imagem de capa/banner** customizável
- **Progresso visível** ao respondente (barra de progresso opcional)
- **Uma pergunta por página** ou **todas na mesma página** (configurável)
- **Obrigatoriedade** por pergunta (marcar como obrigatório)
- **Randomização de ordem** das perguntas (opcional)
- **Limite de respostas** (ex: fechar pesquisa após 500 respostas)
- **Janela de tempo** (data de início e encerramento automático)
- **Permitir múltiplas respostas** do mesmo dispositivo (on/off)
- **Mensagem de agradecimento** customizável ao final
- **Redirecionamento pós-resposta** para URL externa (ex: site da clínica)
- **Proteção por senha** (pesquisas internas para funcionários)

#### 3.2.5 Associação por Ponto de Contato

Cada pesquisa é associada a um ou mais **pontos de contato** da jornada do paciente:

- 🏥 Recepção / Chegada
- 👨‍⚕️ Pós-Consulta Médica
- 🔬 Pós-Exame Diagnóstico
- 🏨 Day Hospital / Pós-Cirurgia
- 🧹 Infraestrutura e Instalações
- 📞 Pós-Atendimento Remoto
- ⚙️ Personalizado (o admin cria novos pontos de contato)

#### 3.2.6 Associação por Especialidade/Setor

Cada pesquisa pode ser associada a uma ou mais especialidades (oftalmologia, cardiologia, etc.) ou setores internos, permitindo relatórios segmentados.

---

### MÓDULO 3 — PERSONALIZAÇÃO VISUAL (TEMA)

#### 3.3.1 Editor de Tema

Interface visual completa com **preview em tempo real** do formulário ao lado das configurações. O paciente verá exatamente o que o admin está configurando.

#### 3.3.2 Configurações Disponíveis

**Identidade da Clínica:**

- Upload do logotipo (PNG/SVG, com posicionamento configurável)
- Imagem de fundo ou capa do formulário
- Nome da clínica exibido no formulário

**Paleta de Cores:**

- Cor primária (botões, destaques, progresso)
- Cor secundária (hover, bordas ativas)
- Cor de fundo da página
- Cor de fundo do card do formulário
- Cor do texto principal
- Cor do texto secundário/placeholder
- Color picker visual com suporte a HEX, RGB e HSL

**Tipografia:**

- Seletor de fonte (Google Fonts integrado — mais de 20 opções curadas)
- Tamanho base do texto (sm / md / lg)
- Peso dos títulos (regular / medium / bold)

**Layout e Forma:**

- Arredondamento dos cantos (quadrado → arredondado → pill)
- Sombra do card (sem / suave / pronunciada)
- Espaçamento interno (compacto / normal / espaçoso)
- Largura máxima do formulário

**Temas Prontos:**

- 🏥 Clínico (branco, azul institucional, limpo)
- 🌿 Saúde Natural (verde suave, tons terrosos)
- 🌙 Dark Care (fundo escuro, toques de teal)
- ☀️ Acolhedor (tons quentes, laranja suave)
- ⚡ Moderno (gradientes, tipografia bold)
- 🎨 Personalizado (salva o tema atual como padrão)

**CSS Avançado (opcional):**

- Campo de CSS customizado para usuários técnicos
- Aplicado como override após os estilos base
- Preview em tempo real

---

### MÓDULO 4 — CANAIS DE DISTRIBUIÇÃO

#### 3.4.1 Link Direto

- URL única por pesquisa: `pesquisa.prontoclinicafortaleza.com.br/p/[slug]`
- Slug customizável pelo admin (ex: `/p/pos-consulta-oftalmo`)
- Opção de URL com token único por paciente (para rastreamento individual)
- Botão de copiar link com feedback visual

#### 3.4.2 QR Code

- Geração automática de QR Code por pesquisa
- Tamanhos: pequeno (crachá), médio (balcão), grande (banner/parede)
- Download em PNG, SVG e PDF
- QR Code com logotipo da Prontoclínica no centro
- Template de arte pronto para impressão (A4, A5, cartão 10x15cm)
- QR Code com cor customizável (seguindo o tema da pesquisa)

#### 3.4.3 Email

- Editor de email de disparo (template HTML responsivo)
- Personalização: saudação com nome do paciente, especialidade consultada
- Agendamento de envio: imediato, X horas após atendimento, ou data específica
- Limite de reenvio (não incomodar paciente mais de X vezes)
- Métricas: taxa de abertura, taxa de clique, taxa de resposta
- Gerenciamento de descadastro (opt-out) automático e conforme LGPD

#### 3.4.4 SMS

- Integração com gateway SMS brasileiro (Zenvia ou Twilio — configurável)
- Mensagem com link encurtado da pesquisa
- Template de mensagem customizável
- Agendamento de disparo
- Respeito a horários (não enviar antes das 8h ou após 20h)
- Controle de opt-out

#### 3.4.5 WhatsApp (API Oficial)

- Integração via **WhatsApp Business API** (Meta Cloud API)
- Template de mensagem HSM aprovado pela Meta
- Envio com botão de ação direto (CTA button) linkando para a pesquisa
- Suporte a envio em lote (lista de números via CSV)
- Agendamento de disparo
- Webhook de status de entrega (enviado, entregue, lido)
- Respeito a janela de 24h da política Meta

#### 3.4.6 Disparo em Lote

- Upload de lista de pacientes via CSV/Excel com campos: nome, telefone, email, especialidade, data do atendimento
- Mapeamento de colunas (o admin mapeia qual coluna é nome, qual é telefone, etc.)
- Preview e validação antes do envio
- Agendamento de envio futuro
- Relatório de disparo (enviados, erros, pendentes)

#### 3.4.7 Widget Embed

- Código JavaScript para incorporar o formulário em qualquer página web
- Modalidade inline (incorporado na página) ou popup (botão flutuante)
- Para uso no site da Prontoclínica

---

### MÓDULO 5 — COLETA DE RESPOSTAS (FORMULÁRIO PÚBLICO)

#### 3.5.1 Experiência do Respondente

- Interface 100% responsiva (mobile-first)
- Carregamento ultra-rápido (formulário estático com hidratação progressiva)
- Funciona offline parcialmente (salva progresso localmente)
- Acessibilidade WCAG 2.1 AA (contraste, navegação por teclado, leitores de tela)
- Animações suaves entre perguntas (sem distrações excessivas)
- Botão "Anterior" para corrigir respostas
- Indicador de progresso opcional
- Proteção anti-bot (hCaptcha invisível — não atrapalha o usuário)

#### 3.5.2 Validação em Tempo Real

- Campos obrigatórios sinalizados com feedback imediato
- Validação de formato (email, telefone)
- Contagem de caracteres em campos de texto
- Prevenção de envio duplicado (token por sessão)

#### 3.5.3 Metadados Capturados Automaticamente

- Data e hora da resposta
- Canal de origem (QR Code, Link, Email, SMS, WhatsApp, Embed)
- Dispositivo (mobile, tablet, desktop)
- Sistema operacional e navegador
- Tempo total de preenchimento
- Ponto de contato associado
- Especialidade/setor associado
- Token do paciente (quando disparo individualizado)

---

### MÓDULO 6 — DASHBOARD E ANALYTICS

#### 3.6.1 Dashboard Principal

Painel em tempo real com atualização automática a cada 5 minutos.

**Cards de KPI (topo):**

- NPS Geral atual + variação vs. período anterior
- Total de respostas (período selecionado)
- Taxa de resposta média (por canal)
- CSAT (Customer Satisfaction Score) médio
- Número de detratores, neutros e promotores

**Gráficos Principais:**

- Evolução do NPS ao longo do tempo (linha temporal — diário/semanal/mensal)
- Distribuição de notas NPS (gráfico de barras 0–10 com zonas coloridas)
- Satisfação por ponto de contato (radar chart)
- Volume de respostas por canal (donut chart)
- Mapa de calor por especialidade (tabela colorida — verde/amarelo/vermelho)

**Feed de Respostas Recentes:**

- Últimas N respostas com nota, comentário e identificação do ponto de contato
- Destaque visual para respostas negativas (NPS ≤ 6 ou nota baixa)
- Filtro rápido: "Apenas negativas" / "Com comentário"

**Filtros Globais do Dashboard:**

- Período: hoje, esta semana, este mês, últimos 30/60/90 dias, período customizado
- Especialidade/setor
- Ponto de contato
- Pesquisa específica
- Canal de origem

#### 3.6.2 Análise por Pesquisa

- Visão detalhada de cada pesquisa individual
- Taxa de conclusão (iniciaram vs. completaram)
- Tempo médio de resposta
- Pergunta por pergunta: distribuição de respostas, média, mediana
- Respostas textuais com opção de busca

#### 3.6.3 Comparativo Entre Períodos

- Tabela side-by-side de dois períodos escolhidos pelo admin
- Variação percentual em cada métrica com indicador ↑↓
- Identificação automática de quedas ou melhorias significativas

---

### MÓDULO 7 — ANÁLISE COM INTELIGÊNCIA ARTIFICIAL

Powered by **Claude API (Anthropic)**. Toda análise é processada de forma assíncrona (em background) e armazenada para consulta instantânea.

#### 3.7.1 Análise de Sentimento

- Classifica cada resposta aberta como: **Positivo / Negativo / Neutro / Misto**
- Score de intensidade emocional (0–100)
- Detecção de emoções secundárias: frustração, gratidão, urgência, elogio
- Exibida inline em cada resposta textual com badge colorido
- Agregada no dashboard: % positivo / negativo / neutro por período

#### 3.7.2 Extração e Agrupamento de Temas

- A IA agrupa automaticamente os feedbacks textuais em **temas recorrentes**
- Ex: "Tempo de espera" (38 menções), "Atendimento da recepcionista" (22), "Limpeza do banheiro" (15)
- Nuvem de palavras interativa
- Lista de temas com volume e tendência (subindo/descendo vs. período anterior)
- Clique em um tema filtra todas as respostas relacionadas
- Temas negativos com maior volume recebem alerta automático

#### 3.7.3 Resumo Executivo Automático

- Gerado semanalmente (toda segunda-feira) e sob demanda
- Texto em linguagem natural, direto ao ponto, focado em gestão
- Estrutura: **Destaques positivos → Pontos de atenção → Tendências → Recomendação prioritária**
- Exemplo de output:
  > _"Na última semana, a Prontoclínica recebeu 142 avaliações com NPS médio de 67 (+4 vs. semana anterior). Os principais elogios foram direcionados ao corpo médico de oftalmologia e à organização do agendamento. O ponto de maior atenção é o tempo de espera na recepção do 2º andar, mencionado negativamente em 23 respostas. Recomendação: priorizar ação imediata na gestão de filas da recepção."_
- Salvos com histórico (é possível consultar resumos anteriores)

#### 3.7.4 Alertas Inteligentes

- **Alerta de Detrator:** NPS ≤ 6 → notificação imediata para o Admin da Clínica (email + notificação no painel)
- **Alerta de Tendência Negativa:** Se NPS cai mais de X pontos em Y dias → alerta automático
- **Alerta de Tema Emergente:** Se um tema negativo cresce mais de 50% em volume em 7 dias → alerta
- **Alerta de Volume Baixo:** Se determinada pesquisa ficou X dias sem respostas → lembrete ao admin
- Configuração de limiares (thresholds) pelo admin
- Histórico de alertas gerados

#### 3.7.5 Análise Comparativa Temporal com IA

- A IA narra automaticamente as variações entre períodos
- Identifica sazonalidades (ex: "Satisfação tende a cair nas segundas-feiras")
- Correlações: ex: "Especialidades com maior tempo de espera têm NPS 18% menor"
- Apresentado como insights textuais + gráficos de suporte

---

### MÓDULO 8 — RELATÓRIOS

#### 3.8.1 Tipos de Relatórios

| Relatório                   | Conteúdo                                           | Formato     |
| --------------------------- | -------------------------------------------------- | ----------- |
| **Executivo Mensal**        | NPS, CSAT, volume, top temas, resumo IA            | PDF visual  |
| **Operacional Detalhado**   | Todas as métricas, por setor, pergunta a pergunta  | PDF + Excel |
| **Por Especialidade**       | Foco em um setor específico, comparativo com média | PDF         |
| **Por Pesquisa**            | Análise completa de uma pesquisa específica        | PDF + Excel |
| **Dados Brutos**            | Todas as respostas individuais exportadas          | Excel/CSV   |
| **Comparativo de Períodos** | Side-by-side de dois períodos escolhidos           | PDF         |
| **Análise de Sentimento**   | Breakdown de sentimentos com temas IA              | PDF         |

#### 3.8.2 Agendamento de Relatórios por Email

- Criação de agendamentos recorrentes: **diário / semanal / quinzenal / mensal**
- Seleção do tipo de relatório e dos filtros (período, setor, pesquisa)
- Lista de destinatários configurável (múltiplos emails)
- Horário de envio configurável
- Email com PDF anexado + resumo IA inline no corpo do email
- Pausa/retomada de agendamentos sem excluí-los
- Histórico de envios (data, destinatários, status de entrega)
- Envio pontual imediato ("Enviar agora") disponível a qualquer momento

#### 3.8.3 Personalização dos Relatórios PDF

- Logotipo da Prontoclínica no cabeçalho
- Cores do tema aplicadas ao PDF
- Rodapé com data de geração e nome do sistema
- Capa com título do relatório e período

---

### MÓDULO 9 — CONFIGURAÇÕES DO SISTEMA

#### 3.9.1 Configurações Gerais da Clínica

- Nome, logotipo, cores institucionais
- Dados de contato exibidos nos formulários
- Fuso horário (America/Fortaleza)
- Configuração de especialidades/setores cadastrados
- Configuração dos pontos de contato customizados

#### 3.9.2 Configurações de Canais

- **Email:** SMTP (host, porta, usuário, senha, remetente)
- **SMS:** API Key do gateway (Zenvia/Twilio), remetente
- **WhatsApp:** Token da Meta Cloud API, número do WABA, templates aprovados
- Teste de envio para cada canal antes de salvar

#### 3.9.3 Configurações de IA

- Ativar/desativar análise de IA por pesquisa
- Frequência do resumo executivo automático
- Thresholds dos alertas inteligentes
- Idioma da análise (PT-BR)

#### 3.9.4 Configurações de LGPD/Privacidade

- Texto de política de privacidade exibido nos formulários
- Opção de coleta anônima (sem identificação do paciente)
- Período de retenção dos dados (ex: 24 meses — dados mais antigos anonimizados)
- Log de consentimento por resposta
- Exportação dos dados de um paciente específico (direito LGPD)
- Exclusão de dados de um paciente específico (direito ao esquecimento)

#### 3.9.5 API e Webhooks (Integração Futura Amigo Tech)

- Geração e gestão de API Keys
- Documentação interativa (Swagger UI) em `/api/docs`
- Configuração de webhooks de saída (ex: notificar sistema externo a cada nova resposta)
- Endpoint de recebimento: `POST /api/webhooks/amigo` (para disparo automático pós-atendimento)
- Log de chamadas de API e webhooks
- Teste de webhook com payload de exemplo

---

### MÓDULO 10 — NOTIFICAÇÕES E ALERTAS

- Central de notificações no painel (sino com badge)
- Notificações em tempo real via WebSocket
- Tipos: novo detrator, alerta de tendência, resumo semanal gerado, relatório enviado, erro de disparo
- Configuração individual de quais notificações cada perfil recebe
- Email de notificação opcional para cada tipo de alerta
- Marcar como lido / arquivar

---

## 4. FORMULÁRIO PÚBLICO — EXPERIÊNCIA DO PACIENTE

### 4.1 Fluxo de Resposta

```
Paciente acessa link/QR Code
        ↓
Carrega tema visual da Prontoclínica
        ↓
Exibe boas-vindas + descrição da pesquisa
        ↓
Perguntas (uma por página ou todas juntas, conforme config)
        ↓
Lógica condicional aplicada em tempo real
        ↓
Tela de agradecimento personalizada
        ↓
(Opcional) Redirecionamento para site da clínica
```

### 4.2 Estados Especiais

- **Pesquisa encerrada:** Mensagem informando que a pesquisa não está mais disponível
- **Já respondeu:** Detecção por cookie/token com mensagem amigável
- **Offline:** Salva progresso localmente e envia quando reconectar
- **Erro de envio:** Mensagem clara com opção de tentar novamente

---

## 5. SEGURANÇA

- HTTPS obrigatório em todas as rotas (Traefik + Let's Encrypt)
- Variáveis de ambiente via `.env` nunca versionadas
- Rate limiting em todas as APIs públicas
- Sanitização de inputs (prevenção de XSS e SQL Injection via Prisma)
- Headers de segurança HTTP (CSP, HSTS, X-Frame-Options)
- Secrets do Docker em variáveis de ambiente seguras
- Backup automático do PostgreSQL (dump diário com retenção de 7 dias)
- Logs de auditoria para todas as ações administrativas
- Proteção de dados sensíveis dos pacientes conforme LGPD

---

## 6. RESPONSIVIDADE E ACESSIBILIDADE

### 6.1 Breakpoints

| Dispositivo       | Largura      | Prioridade                                          |
| ----------------- | ------------ | --------------------------------------------------- |
| Mobile (paciente) | 320px–767px  | **Crítica** — maioria das respostas virão de mobile |
| Tablet            | 768px–1023px | Alta                                                |
| Desktop (admin)   | 1024px+      | Alta — painel admin é principalmente desktop        |

### 6.2 Acessibilidade

- WCAG 2.1 Nível AA
- Contraste mínimo 4.5:1 em textos
- Navegação completa por teclado
- Labels semânticos em todos os inputs
- Suporte a leitores de tela (ARIA)
- Respeito a `prefers-reduced-motion`

---

## 7. FASES DE DESENVOLVIMENTO

### Fase 1 — MVP (Estimativa: 8–10 semanas)

- ✅ Autenticação completa com 5 perfis
- ✅ Construtor de pesquisas com todos os tipos de perguntas
- ✅ Lógica condicional entre perguntas
- ✅ Personalização visual avançada com preview em tempo real
- ✅ Formulário público responsivo
- ✅ Canais: Link direto + QR Code + Email
- ✅ Dashboard básico com KPIs e gráficos
- ✅ Análise de sentimento e resumo executivo via IA
- ✅ Exportação de relatórios PDF e Excel
- ✅ Agendamento de relatórios por email
- ✅ Associação por ponto de contato e especialidade
- ✅ Deploy no VPS com Docker + Traefik + GitHub Actions

### Fase 2 — Expansão (Estimativa: 4–6 semanas após MVP)

- 🔄 Canais: SMS + WhatsApp API Oficial
- 🔄 Disparo em lote via CSV
- 🔄 Extração de temas com IA e nuvem de palavras
- 🔄 Alertas inteligentes avançados
- 🔄 Análise comparativa temporal com IA
- 🔄 Widget embed para o site da clínica
- 🔄 Central de notificações em tempo real
- 🔄 Módulo LGPD completo

### Fase 3 — Integração e Escala

- 🔮 Integração com Amigo Tech via webhook
- 🔮 API pública com documentação Swagger
- 🔮 Multitenant completo para outros clientes
- 🔮 App mobile (React Native) para acesso ao painel
- 🔮 Internacionalização (EN/ES)

---

## 8. MÉTRICAS DE SUCESSO DO PROJETO

| Métrica                                | Meta                   |
| -------------------------------------- | ---------------------- |
| Taxa de resposta via QR Code           | ≥ 15% dos atendimentos |
| Taxa de resposta via WhatsApp          | ≥ 25% dos disparos     |
| Tempo de carregamento do formulário    | < 1.5s em 3G           |
| Tempo de geração do relatório PDF      | < 10s                  |
| Uptime do sistema                      | ≥ 99.5%                |
| Tempo de processamento IA por resposta | < 30s                  |

---

## 9. CONSIDERAÇÕES FINAIS

Este sistema posicionará a Prontoclínica de Fortaleza como referência em **gestão da experiência do paciente** no Ceará, com uma ferramenta proprietária, completamente adaptada à sua realidade operacional, capaz de transformar o feedback dos pacientes em inteligência de gestão acionável.

A arquitetura escolhida garante:

- **Escalabilidade** — suporta crescimento sem reescrita
- **Segurança** — dados sensíveis de saúde protegidos desde o design
- **Flexibilidade** — integração futura com Amigo Tech sem dor
- **Autonomia** — equipe da clínica opera o sistema sem depender de suporte técnico constante

---

_Documento elaborado por RE9 Online Branding Ltda — Junho/2026_  
_Para dúvidas ou ajustes, contato: contato@agenciare9.com.br_
