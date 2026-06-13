import { generateSecret, generateURI, generateSync, verifySync } from "otplib";
import QRCode from "qrcode";

/**
 * 2FA via TOTP (compatível com Google Authenticator / Authy).
 * API do otplib v13 (funcional).
 *
 * TODO(segurança): cifrar `totpSecret` em repouso no banco (ex.: AES-GCM com
 * chave derivada de AUTH_SECRET, ou KMS), em vez de armazenar o segredo em texto
 * plano. A cifragem deve ser introduzida junto de uma migração de dados para os
 * segredos existentes, para não quebrar a verificação dos usuários já cadastrados.
 */
const ISSUER = "Pronto Satisfação";

export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function getTotpUri(email: string, secret: string): string {
  return generateURI({ strategy: "totp", issuer: ISSUER, label: email, secret });
}

export async function getTotpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(getTotpUri(email, secret));
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    const result = verifySync({ strategy: "totp", secret, token });
    return result.valid === true;
  } catch {
    return false;
  }
}

/** Gera o token atual (útil para testes). */
export function currentTotp(secret: string): string {
  return generateSync({ strategy: "totp", secret });
}
