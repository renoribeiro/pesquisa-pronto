"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

export interface LoginState {
  error?: string;
}

/**
 * Server action de login. Usada com useActionState no formulário.
 * Em sucesso, o NextAuth redireciona para /admin.
 */
export async function authenticate(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const totp = (formData.get("totp") as string) || "";
    const tenantSlug = formData.get("tenantSlug") as string | null;

    if (!email || !password) {
      return { error: "Email e senha são obrigatórios." };
    }

    // Rate Limit (E5)
    const rateLimitResult = await rateLimit(`login:${email}`, 5, 900);
    if (!rateLimitResult.allowed) {
      return {
        error: `Muitas tentativas de login. Bloqueado por ${rateLimitResult.resetInSeconds} segundos.`,
      };
    }

    await signIn("credentials", {
      email,
      password,
      totp,
      ...(tenantSlug && tenantSlug !== "null" ? { tenantSlug } : {}),
      redirectTo: "/admin",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email, senha ou código inválidos." };
    }
    // signIn lança um redirect em caso de sucesso — repassar
    throw error;
  }
}
