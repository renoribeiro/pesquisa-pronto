import { requireSuperAdmin } from "@/lib/session";
import { getJobsOverview } from "@/modules/admin/jobs/actions";
import { JobsClient } from "@/modules/admin/jobs/components/jobs-client";

export const metadata = { title: "Jobs & Filas — Pronto Satisfação" };

// Operação de plataforma: dados de fila são globais; renderiza sempre fresco.
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  // Guard de plataforma (a action revalida internamente também).
  await requireSuperAdmin();
  const overview = await getJobsOverview();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Jobs &amp; Filas</h1>
      <JobsClient overview={overview} />
    </div>
  );
}
