"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { requirePermission } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { enqueueEmail } from "@/server/queues";
import { inviteEmail } from "@/modules/auth/emails";
import { audit } from "@/lib/audit";

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  sectorIds: z.array(z.string()).optional(),
});

export async function inviteUser(input: unknown) {
  const { ctx } = await requirePermission("users:manage");
  const data = inviteSchema.parse(input);

  // Só Super Admin pode criar outro Super Admin
  if (data.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode conceder o perfil Super Admin.");
  }

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenantId, email: data.email } },
  });
  if (existing) throw new Error("Já existe um usuário com este email.");

  // Senha aleatória provisória (o usuário define a real pelo link de convite)
  const tempHash = await hashPassword(generateToken(16));
  const user = await prisma.user.create({
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
  await prisma.passwordReset.create({
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
  if (data.role === UserRole.SUPER_ADMIN && ctx.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Apenas Super Admin pode conceder o perfil Super Admin.");
  }
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
