import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
 */

// Modelos que possuem a coluna `tenantId`. Mantenha em sincronia com o schema.
const TENANT_MODELS = new Set<string>([
  "ChannelConfig",
  "User",
  "PasswordReset",
  "Sector",
  "TouchPoint",
  "AuditLog",
  "AccessLog",
  "Survey",
  "Question",
  "QuestionOption",
  "SkipLogicRule",
  "Theme",
  "Distribution",
  "Recipient",
  "DispatchBatch",
  "DispatchJob",
  "Response",
  "Answer",
  "AIAnalysis",
  "TopicCluster",
  "ExecutiveSummary",
  "Alert",
  "AlertThreshold",
  "Report",
  "ReportSchedule",
  "ReportRun",
  "Notification",
  "ApiKey",
  "WebhookEndpoint",
  "WebhookLog",
]);

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

export function forTenant(tenantId: string) {
  if (!tenantId) throw new Error("forTenant: tenantId é obrigatório");

  return prisma.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const a = (args ?? {}) as Record<string, unknown>;

          // Escopar leitura/alteração por tenant
          if (WHERE_OPS.has(operation)) {
            a.where = mergeTenantWhere(a.where, tenantId);
          }

          // Injetar tenantId em create / upsert.create
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

          return query(a);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;
export { Prisma };
