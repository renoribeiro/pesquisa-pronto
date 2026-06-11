import { requirePermission } from "@/lib/session";
import { UsersClient } from "@/modules/users/components/users-client";

export const metadata = { title: "Usuários — Pronto Satisfação" };

export default async function UsersPage() {
  const { ctx, db } = await requirePermission("users:manage");
  const users = await db.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <UsersClient
        canSuperAdmin={ctx.role === "SUPER_ADMIN"}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
        }))}
      />
    </div>
  );
}
