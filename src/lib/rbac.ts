import type { UserRole } from "@prisma/client";

/**
 * RBAC — matriz de permissões dos 5 perfis (escopo §3.1.2).
 *
 * Cada permissão tem um "escopo": `all` (toda a clínica), `sector` (apenas os
 * setores do usuário) ou `none`. Use `can()` para checagem booleana e
 * `scopeOf()` para decidir a abrangência de uma consulta.
 */

export type Permission =
  | "survey:create"
  | "survey:view"
  | "survey:export"
  | "alert:manage"
  | "system:configure"
  | "users:manage";

export type Scope = "all" | "sector" | "none";

const MATRIX: Record<UserRole, Record<Permission, Scope>> = {
  SUPER_ADMIN: {
    "survey:create": "all",
    "survey:view": "all",
    "survey:export": "all",
    "alert:manage": "all",
    "system:configure": "all",
    "users:manage": "all",
  },
  CLINIC_ADMIN: {
    "survey:create": "all",
    "survey:view": "all",
    "survey:export": "all",
    "alert:manage": "all",
    "system:configure": "all", // "parcial" tratado nas server actions específicas
    "users:manage": "all",
  },
  SECTOR_MANAGER: {
    "survey:create": "sector",
    "survey:view": "sector",
    "survey:export": "sector",
    "alert:manage": "sector",
    "system:configure": "none",
    "users:manage": "none",
  },
  OPERATOR: {
    "survey:create": "none",
    "survey:view": "none",
    "survey:export": "none",
    "alert:manage": "none",
    "system:configure": "none",
    "users:manage": "none",
  },
  VIEWER: {
    "survey:create": "none",
    "survey:view": "all", // read-only
    "survey:export": "all",
    "alert:manage": "none", // read-only não gerencia alertas
    "system:configure": "none",
    "users:manage": "none",
  },
};

export function scopeOf(role: UserRole, permission: Permission): Scope {
  return MATRIX[role]?.[permission] ?? "none";
}

export function can(role: UserRole, permission: Permission): boolean {
  return scopeOf(role, permission) !== "none";
}

/** Super Admin opera cross-tenant. */
export function isSuperAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

/** Lança erro se o papel não tiver a permissão. Usar no início de server actions. */
export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Permissão negada: ${permission} para o perfil ${role}`);
  }
}
