# Worker em runtime compilado (tsup/esbuild)

Hoje o worker roda TypeScript via `tsx` em produção (`worker:start` →
`tsx src/workers/index.ts`). `tsx` é uma **devDependency** — tê-la no runtime de
produção aumenta a superfície e o footprint. Compilar o worker para um único
bundle JS remove essa dependência e reduz o tamanho da imagem.

> **Status:** receita pronta e revisada, **não ativada por padrão**. Ativar exige
> (a) adicionar a devDependency `tsup` — que hoje colide com um peer **opcional**
> pré-existente (`openai` pede `zod@^3`, o projeto usa `zod@4`), exigindo
> `--legacy-peer-deps`; e (b) validar o bundle contra um runtime real (Redis), o
> que não é possível no ambiente de dev atual (sem Docker/serviços). Por isso o
> `tsx` permanece como padrão até a validação. Siga os passos abaixo num ambiente
> com serviços para promover o worker compilado.

## 1. Instalar a ferramenta de build

```bash
# O conflito é com um peerOptional (openai↔zod); --legacy-peer-deps é seguro aqui.
npm i -D tsup --legacy-peer-deps
```

> Considere adicionar `.npmrc` com `legacy-peer-deps=true` para tornar instalações
> consistentes (decisão de projeto — discuta antes de versionar).

## 2. `tsup.config.ts` (raiz do projeto)

```ts
import { defineConfig } from "tsup";
import path from "path";

export default defineConfig({
  entry: { worker: "src/workers/index.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node22",
  bundle: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  // tsup externaliza `dependencies`/`peerDependencies` automaticamente (ficam em
  // node_modules); só o código de src/ é empacotado. Alias resolve os imports "@/...",
  // inclusive os dinâmicos (await import("@/workers/processors/...")).
  esbuildOptions(options) {
    options.alias = { "@": path.resolve(__dirname, "src") };
  },
});
```

## 3. Scripts (`package.json`)

```jsonc
{
  "scripts": {
    "worker:build": "tsup",
    "worker:prod": "node dist/worker.cjs"
    // mantenha "worker:start": "tsx src/workers/index.ts" como fallback
  }
}
```

## 4. Validar o bundle

```bash
npm run worker:build           # deve resolver "@/..." e os imports dinâmicos sem erro
node --check dist/worker.cjs   # valida a sintaxe do bundle
# Em ambiente com Redis/Postgres: rode `npm run worker:prod` e confira que as
# filas são consumidas e os repeatables (trend-check/retention) são agendados.
```

Rode o **checklist funcional**: enfileire um e-mail/dispatch e confirme o
processamento; force uma falha e confira o painel `/admin/jobs` (DLQ).

## 5. `Dockerfile.worker`

```dockerfile
# ... estágio builder ...
RUN npx prisma generate
RUN npm run worker:build        # gera dist/worker.cjs

# ... estágio runner ...
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/prisma ./prisma
COPY --from=builder --chown=worker:nodejs /app/package.json ./
CMD ["node", "dist/worker.cjs"]
```

`@prisma/client` permanece externo (resolvido de `node_modules/.prisma` gerado no
builder). Se algo falhar, reverter ao `tsx` é só trocar o `CMD` de volta para
`["npm", "run", "worker:start"]`.

## Por que não está ativo no repositório

- **Validação:** o ganho é operacional (footprint/risco), mas o entrypoint do
  worker em produção não deve mudar sem validação contra um runtime real — não
  disponível neste ambiente.
- **Dependência:** `tsup` exige `--legacy-peer-deps` por um peer opcional
  pré-existente; alterar a política de resolução é decisão de projeto.

Com serviços disponíveis, esta receita leva poucos minutos e é de baixo risco
(deps externas, fallback trivial para `tsx`).
