"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export interface LoginState {
  error?: string;
}

/**
 * Server action de login. Usada com useActionState no formulário.
 * Em sucesso, o NextAuth redireciona para /admin.
 */
export async function authenticate(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      totp: formData.get("totp"),
      tenantSlug: formData.get("tenantSlug"),
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
