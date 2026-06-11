import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Super Admin — Pronto Satisfação" };

export default async function SuperAdminPage() {
  const ctx = await requireSession();

  if (ctx.role !== UserRole.SUPER_ADMIN) {
    redirect("/admin");
  }

  const [tenants, totalResponses, totalUsers] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { surveys: true, users: true, responses: true },
        },
      },
    }),
    prisma.response.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Painel Super Admin</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tenants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Usuários totais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Respostas totais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalResponses}</div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Tenant</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-right font-medium">Pesquisas</th>
              <th className="px-4 py-3 text-right font-medium">Usuários</th>
              <th className="px-4 py-3 text-right font-medium">Respostas</th>
              <th className="px-4 py-3 text-left font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{t.slug}</td>
                <td className="px-4 py-3 text-right">{t._count.surveys}</td>
                <td className="px-4 py-3 text-right">{t._count.users}</td>
                <td className="px-4 py-3 text-right">{t._count.responses}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.createdAt.toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
