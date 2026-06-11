import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma base (singleton).
 * Para acesso isolado por tenant, use `forTenant(tenantId)` de `@/lib/tenant`.
 * Acesso direto a este client deve ser restrito a tarefas administrativas
 * cross-tenant (ex.: Super Admin, seed, jobs de sistema).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
