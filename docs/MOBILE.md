# App mobile (M3.4) — decisão de escopo

**Status: deferido (fora deste repositório).**

O milestone M3.4 do [PLANO-DESENVOLVIMENTO.md](../PLANO-DESENVOLVIMENTO.md) prevê
um app mobile em **React Native** para leitura de dashboard/notificações, e o
próprio plano marca seu escopo como "a refinar no início da fase".

## Por que não está neste repositório

- Um app React Native é uma **aplicação separada** (toolchain Expo/RN, build
  nativo iOS/Android, store deployment) — não pertence a este monorepo Next.js e
  não compartilha bundler, lint ou pipeline de build.
- Misturar RN aqui quebraria o `tsconfig`/ESLint/Next build e não seria
  validável pela CI atual.

## Caminho recomendado (quando priorizado)

O backend já está pronto para suportar um cliente mobile **sem novo trabalho de
servidor relevante**:

- **API pública v1** (`/api/v1/*`, autenticada por API Key) — já entregue (M3.1),
  com OpenAPI em `/api/docs`. Um app RN consome esses endpoints para dashboard.
- **Notificações** — a tabela `Notification` e as preferências (M2.5) já existem;
  basta expor um endpoint v1 de listagem/contagem para o app (push nativo via
  serviço externo é trabalho de app, não de servidor).

Passos sugeridos: criar repositório `pronto-satisfacao-mobile` (Expo + React
Native), autenticar via API Key/token, e consumir `/api/v1`. Definir o escopo de
telas (dashboard read-only + notificações) antes de iniciar.
