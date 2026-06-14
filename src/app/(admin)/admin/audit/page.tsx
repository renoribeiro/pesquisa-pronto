import { requirePermission } from "@/lib/session";
import { getAuditLogs } from "@/modules/audit/actions";
import { AuditClient } from "@/modules/audit/components/audit-client";

export const metadata = { title: "Auditoria — Pronto Satisfação" };

export default async function AuditPage() {
  // Garante a permissão na página (a action revalida internamente também).
  await requirePermission("system:configure");
  const entries = await getAuditLogs();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Auditoria</h1>
      <AuditClient entries={entries} />
    </div>
  );
}
