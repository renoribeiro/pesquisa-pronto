import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { AlertsClient } from "@/modules/alerts/components/alerts-client";
import { getAlerts } from "@/modules/alerts/actions";

export const metadata = { title: "Alertas — Pronto Satisfação" };

export default async function AlertsPage() {
  const { ctx } = await requirePermission("survey:view");
  const canManage = can(ctx.role, "alert:manage");
  const alerts = await getAlerts();
  // `key` derivada dos dados: após router.refresh() (ex.: trend-check criar um
  // alerta), o conjunto muda e o AlertsClient remonta com a lista atualizada.
  const alertsKey = alerts.map((a) => `${a.id}:${a.status}`).join(",");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Alertas</h1>
      <AlertsClient key={alertsKey} alerts={alerts} canManage={canManage} />
    </div>
  );
}
