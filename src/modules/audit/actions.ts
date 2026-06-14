"use server";

import { requirePermission } from "@/lib/session";

/** Item de log de auditoria já serializado para o client (sem objetos Prisma crus). */
export interface AuditLogEntry {
  id: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
}

export interface AuditLogFilters {
  /** Filtra por ação exata (ex.: "settings.clinic_updated"). */
  action?: string;
  /** Filtra por usuário. */
  userId?: string;
}

const LIST_LIMIT = 200;
const EXPORT_LIMIT = 1000;

/**
 * Lista as entradas de auditoria do tenant atual (últimas {@link LIST_LIMIT}).
 * Exige permissão `system:configure`. Usa o client isolado por tenant.
 */
export async function getAuditLogs(filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
  const { db } = await requirePermission("system:configure");

  const logs = await db.auditLog.findMany({
    where: {
      ...(filters?.action ? { action: filters.action } : {}),
      ...(filters?.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { user: { select: { name: true, email: true } } },
  });

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userName: log.user?.name ?? null,
    userEmail: log.user?.email ?? null,
    action: log.action,
    entity: log.entity ?? null,
    entityId: log.entityId ?? null,
    metadata: log.metadata ?? null,
  }));
}

/** Escapa um campo para CSV (RFC 4180) + neutraliza injeção de fórmula. */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str =
    typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  // CSV formula injection: Excel/Sheets executa células iniciadas por = + - @
  // (ou tab/CR). Prefixa com aspa simples para forçar tratamento como texto.
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  // Sempre entre aspas; aspas internas dobradas. Cobre vírgulas, quebras de linha e aspas.
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Gera um CSV (string) das últimas {@link EXPORT_LIMIT} entradas de auditoria do tenant.
 * Cabeçalho: data,usuario,acao,entidade,detalhes. Exige `system:configure`.
 */
export async function exportAuditCsv(filters?: AuditLogFilters): Promise<string> {
  const { db } = await requirePermission("system:configure");

  const logs = await db.auditLog.findMany({
    where: {
      ...(filters?.action ? { action: filters.action } : {}),
      ...(filters?.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { user: { select: { name: true, email: true } } },
  });

  const header = ["data", "usuario", "acao", "entidade", "detalhes"];
  const rows = logs.map((log) => {
    const usuario = log.user?.name ?? log.user?.email ?? (log.userId ? log.userId : "sistema");
    const entidade = [log.entity, log.entityId].filter(Boolean).join(":");
    return [
      log.createdAt.toISOString(),
      usuario,
      log.action,
      entidade,
      log.metadata ?? "",
    ]
      .map(csvEscape)
      .join(",");
  });

  // BOM para que o Excel interprete UTF-8 corretamente (acentos).
  return "﻿" + [header.map(csvEscape).join(","), ...rows].join("\r\n") + "\r\n";
}
