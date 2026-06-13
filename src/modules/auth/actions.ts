"use server";
 
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { enqueueEmail } from "@/server/queues";
import { audit } from "@/lib/audit";
import { passwordResetEmail } from "@/modules/auth/emails";
import { rateLimit } from "@/lib/rate-limit";

const RESET_TTL_MINUTES = 30;

const requestSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().optional(),
});

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Solicita reset de senha. Resposta é sempre "ok" para não vazar existência de email.
 */
export async function requestPasswordReset(input: {
  email: string;
  tenantSlug?: string;
}): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(input);
  const genericOk: ActionResult = {
    ok: true,
    message: "Se o email existir, enviaremos instruções de redefinição.",
  };
  if (!parsed.success) return genericOk;

  // Rate Limit (E5)
  const rateLimitResult = await rateLimit(`reset:${parsed.data.email}`, 3, 3600);
  if (!rateLimitResult.allowed) {
    return genericOk;
  }

  const tenantSlug = parsed.data.tenantSlug || env.DEFAULT_TENANT_SLUG;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return genericOk;

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: parsed.data.email } },
  });
  if (!user || !user.active) return genericOk;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
  await prisma.passwordReset.create({
    data: { tenantId: tenant.id, userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const url = `${env.APP_URL}/reset-password?token=${token}`;
  await enqueueEmail({
    to: user.email,
    subject: "Redefinição de senha — Pronto Satisfação",
    html: passwordResetEmail({ name: user.name, url, ttlMinutes: RESET_TTL_MINUTES }),
  });

  await audit({ tenantId: tenant.id, userId: user.id, action: "auth.password_reset_requested" });
  return genericOk;
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

/** Confirma o reset com o token recebido por email. */
export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, message: "Link inválido ou expirado." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await audit({
    tenantId: record.tenantId,
    userId: record.userId,
    action: "auth.password_reset_completed",
  });
  return { ok: true, message: "Senha redefinida com sucesso. Você já pode entrar." };
}
