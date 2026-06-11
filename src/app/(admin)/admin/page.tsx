import { requireTenantDb } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Painel — Pronto Satisfação" };

export default async function AdminHomePage() {
  const { ctx, db } = await requireTenantDb();

  const [surveys, responses, openAlerts] = await Promise.all([
    db.survey.count(),
    db.response.count(),
    db.alert.count({ where: { status: "OPEN" } }),
  ]);

  const cards = [
    { label: "Pesquisas", value: surveys },
    { label: "Respostas", value: responses },
    { label: "Alertas abertos", value: openAlerts },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bem-vindo(a), {ctx.name}</h1>
        <p className="text-muted-foreground">Visão geral da experiência do paciente.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        O dashboard completo com NPS, CSAT e gráficos está em{" "}
        <a className="underline" href="/admin/analytics">
          Analytics
        </a>
        .
      </p>
    </div>
  );
}
