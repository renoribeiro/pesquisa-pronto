import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@prisma/client";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { decryptSafe } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { resetRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase()),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
  totp: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        tenantSlug: {},
        totp: {},
      },
      async authorize(raw) {
        logger.debug("Authorize credentials verification started");
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          logger.debug("safeParse failed for credentials input");
          return null;
        }
        const { email, password, totp } = parsed.data;
        let tenantSlug = parsed.data.tenantSlug || env.DEFAULT_TENANT_SLUG;
        if (tenantSlug === "null" || tenantSlug === "undefined") {
          tenantSlug = env.DEFAULT_TENANT_SLUG;
        }
        logger.debug("parsed inputs schema validation success", { tenantSlug, hasPassword: !!password, hasTotp: !!totp });

        const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!tenant) {
          logger.warn("Login failure: tenant not found for slug:", tenantSlug);
          return null;
        }
        if (!tenant.active) {
          logger.warn("Login failure: tenant is inactive:", tenantSlug);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          include: { sectors: { select: { id: true } } },
        });
        if (!user) {
          logger.warn("Login failure: user email not found in tenant");
          return null;
        }
        if (!user.active) {
          logger.warn("Login failure: user is inactive");
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          logger.warn("Login failure: password verification failed");
          return null;
        }

        // 2FA: se habilitado, exige TOTP válido. O segredo é cifrado em repouso;
        // decryptSafe retorna null em falha (ex.: rotação de chave) para tratar
        // como login reprovado em vez de erro 500.
        if (user.totpEnabled && user.totpSecret) {
          const secret = decryptSafe(user.totpSecret);
          if (!secret) {
            logger.warn("Login failure: TOTP secret could not be decrypted (possível rotação/mismatch de chave)");
            return null;
          }
          if (!totp || !verifyTotp(totp, secret)) {
            logger.warn("Login failure: TOTP verification failed");
            return null;
          }
        }

        logger.info("Login successful for user ID:", user.id);
        await resetRateLimit(`login:${email}`);

        // Atualiza lastLogin (best-effort)
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          sectorIds: user.sectors.map((s) => s.id),
          tokenVersion: user.tokenVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Override Node (com Prisma) do jwt: revalida a sessão contra o banco a cada
    // requisição. Invalida (retorna null) se o usuário foi desativado ou se o
    // tokenVersion mudou (logout forçado após troca de senha / mudança de papel).
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          tenantId: string;
          role: UserRole;
          sectorIds: string[];
          tokenVersion: number;
        };
        token.id = u.id;
        token.tenantId = u.tenantId;
        token.role = u.role;
        token.sectorIds = u.sectorIds;
        token.tokenVersion = u.tokenVersion ?? 0;
        return token;
      }

      // Revalida contra o DB a CADA requisição autenticada (invalidação imediata
      // após desativar usuário / trocar senha / mudar papel). Para um painel
      // admin o custo — um findUnique por PK indexada — é negligível e o ganho
      // de segurança (sem janela cega) compensa.
      const t = token as { id?: string; tokenVersion?: number };
      if (t.id) {
        let dbUser;
        try {
          dbUser = await prisma.user.findUnique({
            where: { id: t.id },
            select: { active: true, role: true, tokenVersion: true, sectors: { select: { id: true } } },
          });
        } catch (err) {
          // Falha transitória do DB (ex.: pool esgotado, blip de rede) NÃO deve
          // deslogar todos os usuários. Mantém o token atual; a revalidação
          // ocorre de novo na próxima requisição. Trade-off consciente: uma
          // invalidação pendente pode atrasar um ciclo durante a indisponibilidade.
          logger.error("jwt revalidation: falha ao consultar usuário; mantendo sessão", err);
          return token;
        }
        if (!dbUser || !dbUser.active || dbUser.tokenVersion !== t.tokenVersion) {
          return null; // sessão invalidada (inativo ou tokenVersion mudou)
        }
        // Mantém papel/setores sempre frescos.
        token.role = dbUser.role;
        token.sectorIds = dbUser.sectors.map((s) => s.id);
      }
      return token;
    },
  },
});
