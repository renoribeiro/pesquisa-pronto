"use server";
 
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setTenantGuc } from "@/lib/tenant";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { enqueueEmail } from "@/server/queues";
import { audit } from "@/lib/audit";
import { passwordResetEmail } from "@/modules/auth/emails";
import { rateLimit } from "@/lib/rate-limit";

const RESET_TTL_MINUTES = 30;

const requestSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
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

  // Invalida quaisquer resets pendentes anteriores do mesmo usuário antes de
  // criar um novo (evita múltiplos links de reset válidos simultaneamente).
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

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

const STRONG_PASSWORD_MESSAGE =
  "A senha deve ter ao menos 10 caracteres, incluindo uma letra minúscula, uma maiúscula e um dígito.";

const strongPassword = z
  .string()
  .min(10, STRONG_PASSWORD_MESSAGE)
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value),
    STRONG_PASSWORD_MESSAGE,
  );

const resetSchema = z.object({
  token: z.string().min(1),
  password: strongPassword,
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
  // Consome o token de forma ATÔMICA: o updateMany com `usedAt: null` é a guarda
  // (lock de linha); sob corrida, apenas uma requisição reivindica (count 1) e
  // troca a senha — a outra recebe count 0 e é rejeitada. Evita TOCTOU de
  // duplo-uso do token de reset.
  const claimed = await prisma.$transaction(async (tx) => {
    // Contexto RLS (quando ativo): o reset opera sobre dados do tenant do token.
    await setTenantGuc(tx, record.tenantId);
    const claim = await tx.passwordReset.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) return false;
    // Recusa se o usuário foi desativado após a emissão do link: um titular
    // inativo não deve poder (re)definir senha e recuperar acesso.
    const target = await tx.user.findUnique({
      where: { id: record.userId },
      select: { active: true },
    });
    if (!target || !target.active) return false;
    // BUMP do tokenVersion: redefinir a senha invalida sessões antigas (logout forçado).
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return true;
  });
  if (!claimed) {
    return { ok: false, message: "Link inválido ou expirado." };
  }

  await audit({
    tenantId: record.tenantId,
    userId: record.userId,
    action: "auth.password_reset_completed",
  });
  return { ok: true, message: "Senha redefinida com sucesso. Você já pode entrar." };
}
