import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Registra uma ação administrativa no audit log.
 * Usa o client base de propósito (o log é cross-cutting); sempre informe tenantId.
 */
export async function audit(params: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: params.metadata as object | undefined,
      },
    });
  } catch (err) {
    logger.error("[audit] falha ao registrar", { action: params.action, tenantId: params.tenantId }, err);
  }
}

/** Registra um acesso (login/tentativa). */
export async function logAccess(params: {
  tenantId: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  success: boolean;
}): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        ip: params.ip,
        userAgent: params.userAgent,
        success: params.success,
      },
    });
  } catch (err) {
    logger.error("[accessLog] falha ao registrar", { tenantId: params.tenantId, success: params.success }, err);
  }
}
