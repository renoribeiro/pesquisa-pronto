import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Temas — Pronto Satisfação" };

export default async function ThemesPage() {
  const { db } = await requirePermission("survey:create");
  const themes = await db.theme.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Temas</h1>
        <Button render={<Link href="/admin/themes/new" />}>Novo tema</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <Link key={t.id} href={`/admin/themes/${t.id}`}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {t.name}
                  {t.isDefault ? <Badge>Padrão</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Editar tema</CardContent>
            </Card>
          </Link>
        ))}
        {themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum tema personalizado. Crie um a partir de um preset.
          </p>
        ) : null}
      </div>
    </div>
  );
}
