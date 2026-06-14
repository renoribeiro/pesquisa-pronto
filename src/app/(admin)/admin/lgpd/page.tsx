import { requirePermission } from "@/lib/session";
import { LgpdPanel } from "@/modules/lgpd/components/lgpd-panel";

export const metadata = { title: "LGPD — Pronto Satisfação" };

export default async function LgpdPage() {
  await requirePermission("system:configure");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">LGPD</h1>
        <p className="text-sm text-[#6E6565] font-semibold">
          Gestão de privacidade: direitos do titular (acesso, portabilidade e exclusão) e rotina
          de retenção/anonimização de dados.
        </p>
      </div>
      <LgpdPanel />
    </div>
  );
}
