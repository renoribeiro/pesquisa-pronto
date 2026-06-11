import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "@/modules/settings/components/settings-client";

export const metadata = { title: "Configurações — Pronto Satisfação" };

export default async function SettingsPage() {
  const { ctx, db } = await requirePermission("system:configure");

  const [tenant, sectors, touchPoints] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId } }),
    db.sector.findMany({ orderBy: { name: "asc" } }),
    db.touchPoint.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <SettingsClient
        clinic={{
          name: tenant.name,
          contactEmail: tenant.contactEmail,
          contactPhone: tenant.contactPhone,
          address: tenant.address,
          timezone: tenant.timezone,
          privacyPolicy: tenant.privacyPolicy,
          retentionMonths: tenant.retentionMonths,
          logoUrl: tenant.logoUrl,
        }}
        sectors={sectors.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
        touchPoints={touchPoints.map((t) => ({
          id: t.id,
          name: t.name,
          active: t.active,
          icon: t.icon,
        }))}
      />
    </div>
  );
}
