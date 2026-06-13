import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AlertsClient } from "@/modules/alerts/components/alerts-client";
import { getAlerts } from "@/modules/alerts/actions";

export const metadata = { title: "Alertas — Pronto Satisfação" };

export default async function AlertsPage() {
  const { ctx } = await requirePermission("survey:view");
  const canManage = can(ctx.role, "alert:manage");
  const alerts = await getAlerts();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Alertas</h1>
      <AlertsClient alerts={alerts} canManage={canManage} />
    </div>
  );
}
