import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { ThemeEditor } from "@/modules/themes/components/theme-editor";
import { themeConfigSchema } from "@/modules/themes/theme-config";
import { DEFAULT_THEME_CONFIG } from "@/modules/themes/presets";

export const metadata = { title: "Editar tema — Pronto Satisfação" };

export default async function ThemeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requirePermission("survey:create");
  const theme = await db.theme.findFirst({ where: { id } });
  if (!theme) notFound();

  const parsed = themeConfigSchema.safeParse(theme.config);
  const config = parsed.success ? parsed.data : DEFAULT_THEME_CONFIG;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar tema</h1>
      <ThemeEditor
        themeId={theme.id}
        initialName={theme.name}
        initialConfig={config}
        initialDefault={theme.isDefault}
      />
    </div>
  );
}
