import { describe, it, expect } from "vitest";
import { can, scopeOf, isSuperAdmin, assertCan } from "@/lib/rbac";

describe("RBAC — matriz de permissões (escopo §3.1.2)", () => {
  it("Super Admin pode tudo, cross-tenant", () => {
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(can("SUPER_ADMIN", "system:configure")).toBe(true);
    expect(can("SUPER_ADMIN", "users:manage")).toBe(true);
    expect(scopeOf("SUPER_ADMIN", "survey:view")).toBe("all");
  });

  it("Admin da Clínica gerencia toda a clínica", () => {
    expect(can("CLINIC_ADMIN", "survey:create")).toBe(true);
    expect(can("CLINIC_ADMIN", "users:manage")).toBe(true);
    expect(scopeOf("CLINIC_ADMIN", "survey:view")).toBe("all");
  });

  it("Gestor de Setor só atua no próprio setor e não configura/gerencia usuários", () => {
    expect(scopeOf("SECTOR_MANAGER", "survey:create")).toBe("sector");
    expect(scopeOf("SECTOR_MANAGER", "survey:view")).toBe("sector");
    expect(can("SECTOR_MANAGER", "system:configure")).toBe(false);
    expect(can("SECTOR_MANAGER", "users:manage")).toBe(false);
  });

  it("Operador não tem nenhuma permissão de gestão", () => {
    expect(can("OPERATOR", "survey:create")).toBe(false);
    expect(can("OPERATOR", "survey:view")).toBe(false);
    expect(can("OPERATOR", "survey:export")).toBe(false);
  });

  it("Visualizador só lê e exporta (read-only)", () => {
    expect(can("VIEWER", "survey:view")).toBe(true);
    expect(can("VIEWER", "survey:export")).toBe(true);
    expect(can("VIEWER", "survey:create")).toBe(false);
    expect(can("VIEWER", "system:configure")).toBe(false);
  });

  it("assertCan lança quando negado", () => {
    expect(() => assertCan("OPERATOR", "survey:create")).toThrow();
    expect(() => assertCan("CLINIC_ADMIN", "survey:create")).not.toThrow();
  });

  it("alert:manage é negado a VIEWER e OPERATOR (read-only não gerencia alertas)", () => {
    // Regressão H5: acknowledgeAlert exige alert:manage, não survey:view.
    expect(can("VIEWER", "alert:manage")).toBe(false);
    expect(can("OPERATOR", "alert:manage")).toBe(false);
    // Mas VIEWER continua podendo ver (listar) alertas.
    expect(can("VIEWER", "survey:view")).toBe(true);
  });

  it("alert:manage é concedido a admins e gestor de setor", () => {
    expect(can("SUPER_ADMIN", "alert:manage")).toBe(true);
    expect(can("CLINIC_ADMIN", "alert:manage")).toBe(true);
    expect(scopeOf("SECTOR_MANAGER", "alert:manage")).toBe("sector");
  });
});
