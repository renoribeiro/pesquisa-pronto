import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { env } from "@/lib/env";

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
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;
        const tenantSlug = parsed.data.tenantSlug || env.DEFAULT_TENANT_SLUG;

        const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!tenant || !tenant.active) return null;

        const user = await prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          include: { sectors: { select: { id: true } } },
        });
        if (!user || !user.active) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // 2FA: se habilitado, exige TOTP válido
        if (user.totpEnabled && user.totpSecret) {
          if (!totp || !verifyTotp(totp, user.totpSecret)) return null;
        }

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
