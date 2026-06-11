import { requirePermission } from "@/lib/session";
import { ThemeEditor } from "@/modules/themes/components/theme-editor";
import { DEFAULT_THEME_CONFIG } from "@/modules/themes/presets";

export const metadata = { title: "Novo tema — Pronto Satisfação" };

export default async function NewThemePage() {
  await requirePermission("survey:create");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo tema</h1>
      <ThemeEditor initialName="Meu tema" initialConfig={DEFAULT_THEME_CONFIG} initialDefault={false} />
    </div>
  );
}
