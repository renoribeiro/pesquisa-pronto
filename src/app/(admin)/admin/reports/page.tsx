import { requirePermission } from "@/lib/session";
import { ReportsClient } from "@/modules/reports/components/reports-client";
import { getReports } from "@/modules/reports/actions";

export const metadata = { title: "Relatórios — Pronto Satisfação" };

export default async function ReportsPage() {
  await requirePermission("survey:export");
  const reports = await getReports();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Relatórios</h1>
      <ReportsClient reports={reports} />
    </div>
  );
}
