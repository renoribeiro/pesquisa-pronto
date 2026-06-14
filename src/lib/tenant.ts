import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Tenant guard — isolamento multitenant em camada de dados.
 *
 * `forTenant(tenantId)` retorna um cliente Prisma estendido que, para todos os
 * modelos com a coluna `tenantId`:
 *   - injeta `where: { tenantId }` em operações de leitura/alteração;
 *   - injeta `tenantId` em `create` / `createMany`.
 *
 * Isso evita vazamento de dados entre clínicas mesmo em caso de query
 * mal escrita na camada de aplicação. O cliente base (`prisma`) só deve ser
 * usado para operações de sistema/cross-tenant conscientes.
 *
 * ── 2ª camada: RLS (Row-Level Security) ──────────────────────────────────────
 * Quando `env.RLS_ENABLED` está ligado, cada operação também define
 * `app.tenant_id` (via `set_config(..., true)`, escopo de transação) na MESMA
 * conexão da query — ativando o enforcement das policies do Postgres como
 * defesa em profundidade: mesmo um bug que escape do guard de aplicação não
 * vaza entre tenants. Desligado (padrão), o comportamento é idêntico ao
 * anterior — nenhuma query é embrulhada em transação. Ver docs/RLS.md para o
 * runbook de ativação (role de runtime restrito + migração FORCE).
 *
 * IMPORTANTE: com RLS ligado, NÃO use `forTenant(id).$transaction(...)` (a
 * operação dentro embrulharia em transação aninhada). Para lógica
 * transacional escopada por tenant, use `withTenant(id, async (tx) => ...)`.
 */

// Modelos que possuem a coluna `tenantId`, derivados automaticamente do schema
// via DMMF do Prisma. Isso garante paridade permanente com o schema: qualquer
// novo modelo com `tenantId` passa a ser escopado pelo guard sem edição manual.
const TENANT_MODELS = new Set<string>(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "tenantId"))
    .map((m) => m.name),
);

// Operações cujo `args.where` deve ser escopado por tenant.
const WHERE_OPS = new Set<string>([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
  "upsert",
]);

function mergeTenantWhere(where: unknown, tenantId: string): Record<string, unknown> {
  return { ...(where as Record<string, unknown>), tenantId };
}

/** Aplica a injeção de tenant aos `args` da operação (escopo por tenant). */
function injectTenant(operation: string, args: unknown, tenantId: string): Record<string, unknown> {
  const a = (args ?? {}) as Record<string, unknown>;

  if (WHERE_OPS.has(operation)) {
    a.where = mergeTenantWhere(a.where, tenantId);
  }
  if (operation === "create") {
    a.data = { ...(a.data as Record<string, unknown>), tenantId };
  }
  if (operation === "upsert") {
    a.create = { ...(a.create as Record<string, unknown>), tenantId };
  }
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const data = a.data;
    if (Array.isArray(data)) {
      a.data = data.map((d) => ({ ...(d as Record<string, unknown>), tenantId }));
    } else if (data) {
      a.data = { ...(data as Record<string, unknown>), tenantId };
    }
  }
  return a;
}

// Chave de sessão lida pelas policies RLS. `set_config(key, val, true)` => escopo
// LOCAL (transação): o valor some ao fim da transação, seguro com pool de
// conexões reaproveitadas. tenantId entra como parâmetro ($1), sem interpolação.
const TENANT_GUC = "app.tenant_id";
const SET_TENANT_GUC = `SELECT set_config('${TENANT_GUC}', $1, true)`;

/**
 * Extensão de injeção de tenant SEM embrulho transacional. Usada dentro de
 * `withTenant` (onde a transação — e o GUC — já estão estabelecidos pelo
 * chamador), evitando transações aninhadas.
 */
function tenantArgsExtension(tenantId: string) {
  return Prisma.defineExtension({
    name: "tenant-guard-args",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(injectTenant(operation, args, tenantId));
        },
      },
    },
  });
}

export function forTenant(tenantId: string) {
  if (!tenantId) throw new Error("forTenant: tenantId é obrigatório");

  const rls = env.RLS_ENABLED;

  return prisma.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = injectTenant(operation, args, tenantId);

          if (!rls) return query(a);

          // RLS ligado: define o GUC e executa a query na MESMA transação/conexão,
          // para que as policies do Postgres enxerguem `app.tenant_id`.
          const [, result] = await prisma.$transaction([
            prisma.$queryRawUnsafe(SET_TENANT_GUC, tenantId),
            query(a),
          ]);
          return result;
        },
      },
    },
  });
}

// Cliente estendido apenas com a injeção de tenant (sem embrulho transacional).
// O `$transaction` deste cliente produz um `tx` cujas operações já injetam o
// tenant — e, por NÃO ter o embrulho do `forTenant`, não há transação aninhada.
function tenantArgsClient(tenantId: string) {
  return prisma.$extends(tenantArgsExtension(tenantId));
}

// Tipo do cliente transacional escopado por tenant entregue a `withTenant`.
// Espelha como o Prisma tipa o itx client (sem os métodos de nível de client).
export type TenantTxClient = Omit<
  ReturnType<typeof tenantArgsClient>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Executa `fn` dentro de UMA transação escopada por tenant. O cliente `tx`
 * passado a `fn` aplica a injeção de tenant (igual ao `forTenant`), e — quando
 * `env.RLS_ENABLED` — define `app.tenant_id` como primeira instrução da
 * transação, ativando o enforcement RLS para todas as queries do bloco.
 *
 * Substitui `db.$transaction(...)` no código escopado por tenant: o
 * comportamento com RLS desligado é idêntico (injeção de tenant + atomicidade);
 * com RLS ligado, ganha o GUC sem risco de transação aninhada.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTxClient) => Promise<T>,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    maxWait?: number;
    timeout?: number;
  },
): Promise<T> {
  if (!tenantId) throw new Error("withTenant: tenantId é obrigatório");

  return tenantArgsClient(tenantId).$transaction(async (tx) => {
    if (env.RLS_ENABLED) {
      await tx.$queryRawUnsafe(SET_TENANT_GUC, tenantId);
    }
    return fn(tx as TenantTxClient);
  }, options);
}

/**
 * Define `app.tenant_id` (escopo de transação) na conexão de `tx` quando
 * `env.RLS_ENABLED`. No-op quando desligado. Para uso em transações que rodam
 * pelo cliente base (`prisma.$transaction`) em fluxos cross-context legítimos
 * (ex.: submissão pública de resposta, reset de senha) que ainda precisam
 * carregar o contexto de tenant para as policies RLS quando ativadas.
 */
export async function setTenantGuc(
  tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
  tenantId: string,
): Promise<void> {
  if (!env.RLS_ENABLED) return;
  await tx.$queryRawUnsafe(SET_TENANT_GUC, tenantId);
}

export type TenantClient = ReturnType<typeof forTenant>;
export { Prisma };
