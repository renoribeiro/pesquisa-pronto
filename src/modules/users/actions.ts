"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { env } from "@/lib/env";
import { requirePermission } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { enqueueEmail } from "@/server/queues";
import { inviteEmail } from "@/modules/auth/emails";
import { audit } from "@/lib/audit";

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
  role: z.nativeEnum(UserRole),
  sectorIds: z.array(z.string()).optional(),
});

const PRIVILEGED_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CLINIC_ADMIN];

/**
 * Valida que todos os setores informados pertencem ao tenant atual.
 * Usa o client já isolado por tenant (`db`), então `count` já filtra por tenantId.
 */
async function assertSectorsBelongToTenant(
  db: Awaited<ReturnType<typeof requirePermission>>["db"],
  sectorIds: string[] | undefined,
) {
  if (!sectorIds?.length) return;
  const found = await db.sector.count({ where: { id: { in: sectorIds } } });
  if (found !== sectorIds.length) {
    throw new Error("Um ou mais setores informados não pertencem a esta clínica.");
  }
}

/**
 * Verifica se `userId` é o último admin privilegiado (SUPER_ADMIN/CLINIC_ADMIN)
 * ativo do tenant. Usado para impedir desativar/rebaixar o único administrador
 * e travar a gestão da clínica.
 */
async function isLastActivePrivilegedAdmin(
  db: Awaited<ReturnType<typeof requirePermission>>["db"],
  userId: string,
): Promise<boolean> {
  const activeAdmins = await db.user.count({
    where: { active: true, role: { in: PRIVILEGED_ROLES } },
  });
  if (activeAdmins > 1) return false;
  // Há no máximo 1 admin ativo: é o último se o alvo for justamente ele.
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });
  return !!target && target.active && PRIVILEGED_ROLES.includes(target.role);
}

export async function inviteUser(input: unknown) {
  const { ctx, db } = await requirePermission("users:manage");
  const data = inviteSchema.parse(input);

  // Só Super Admin pode criar outro Super Admin
  if (data.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode conceder o perfil Super Admin.");
  }

  // H2: todos os setores devem pertencer ao tenant.
  await assertSectorsBelongToTenant(db, data.sectorIds);

  const existing = await db.user.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenantId, email: data.email } },
  });
  if (existing) throw new Error("Já existe um usuário com este email.");

  // Senha aleatória provisória (o usuário define a real pelo link de convite)
  const tempHash = await hashPassword(generateToken(16));
  const user = await db.user.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      email: data.email,
      passwordHash: tempHash,
      role: data.role,
      active: true,
      sectors: data.sectorIds?.length
        ? { connect: data.sectorIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  // Token de definição de senha (reaproveita o fluxo de reset)
  const token = generateToken();
  await db.passwordReset.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000), // 7 dias para convites
    },
  });

  await enqueueEmail({
    to: user.email,
    subject: "Convite de acesso — Pronto Satisfação",
    html: inviteEmail({
      name: user.name,
      url: `${env.APP_URL}/reset-password?token=${token}`,
      inviterName: ctx.name ?? undefined,
    }),
  });

  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.invite",
    entity: "User",
    entityId: user.id,
    metadata: { email: data.email, role: data.role },
  });
  revalidatePath("/admin/users");
}

export async function toggleUser(id: string, active: boolean) {
  const { ctx, db } = await requirePermission("users:manage");
  if (id === ctx.userId) throw new Error("Você não pode desativar a si mesmo.");

  const target = await db.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!target) throw new Error("Usuário não encontrado.");

  // Apenas Super Admin pode gerenciar um Super Admin.
  if (target.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode gerenciar um Super Admin.");
  }

  // Impede desativar o último administrador ativo da clínica.
  if (!active && (await isLastActivePrivilegedAdmin(db, id))) {
    throw new Error("Não é possível desativar o último administrador ativo da clínica.");
  }

  await db.user.update({ where: { id }, data: { active } });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: active ? "user.activate" : "user.deactivate",
    entity: "User",
    entityId: id,
  });
  revalidatePath("/admin/users");
}

const roleSchema = z.object({
  id: z.string(),
  role: z.nativeEnum(UserRole),
  sectorIds: z.array(z.string()).optional(),
});

export async function updateUserRole(input: unknown) {
  const { ctx, db } = await requirePermission("users:manage");
  const data = roleSchema.parse(input);

  // Só Super Admin pode conceder o perfil Super Admin.
  if (data.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode conceder o perfil Super Admin.");
  }

  const target = await db.user.findUnique({
    where: { id: data.id },
    select: { role: true },
  });
  if (!target) throw new Error("Usuário não encontrado.");

  // Apenas Super Admin pode gerenciar (rebaixar/alterar) um Super Admin.
  if (target.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode gerenciar um Super Admin.");
  }

  // Impede o próprio usuário de se auto-rebaixar de um papel privilegiado.
  if (
    data.id === ctx.userId &&
    PRIVILEGED_ROLES.includes(ctx.role) &&
    !PRIVILEGED_ROLES.includes(data.role)
  ) {
    throw new Error("Você não pode rebaixar o seu próprio perfil de administrador.");
  }

  // Impede rebaixar o último administrador ativo da clínica.
  const demotingFromAdmin =
    PRIVILEGED_ROLES.includes(target.role) && !PRIVILEGED_ROLES.includes(data.role);
  if (demotingFromAdmin && (await isLastActivePrivilegedAdmin(db, data.id))) {
    throw new Error("Não é possível rebaixar o último administrador ativo da clínica.");
  }

  // H2: todos os setores devem pertencer ao tenant.
  await assertSectorsBelongToTenant(db, data.sectorIds);

  await db.user.update({
    where: { id: data.id },
    data: {
      role: data.role,
      sectors: data.sectorIds ? { set: data.sectorIds.map((id) => ({ id })) } : undefined,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.update_role",
    entity: "User",
    entityId: data.id,
    metadata: { role: data.role },
  });
  revalidatePath("/admin/users");
}
