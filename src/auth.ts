import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { resetRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
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

        // 2FA: se habilitado, exige TOTP válido
        if (user.totpEnabled && user.totpSecret) {
          if (!totp || !verifyTotp(totp, user.totpSecret)) {
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
        };
      },
    }),
  ],
});
