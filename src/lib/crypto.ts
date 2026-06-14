import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "@/lib/env";

/**
 * Cifra de dados sensíveis em repouso (AES-256-GCM).
 *
 * Usado para segredos como `User.totpSecret`, `WebhookEndpoint.secret` e tokens
 * de canal. A chave é derivada de `DATA_ENC_KEY` (ou `AUTH_SECRET` como
 * fallback em dev) via scrypt — nunca fica no banco.
 *
 * Formato do token: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * `decrypt` de um valor sem o prefixo retorna o valor cru (compatibilidade com
 * dados legados em texto puro), permitindo migração incremental.
 */

const PREFIX = "v1";
let _key: Buffer | null = null;

function key(): Buffer {
  if (_key) return _key;
  const secret = env.DATA_ENC_KEY || env.AUTH_SECRET;
  if (!secret) {
    throw new Error("DATA_ENC_KEY (ou AUTH_SECRET) não configurada para cifra em repouso.");
  }
  if (secret.length < 16) {
    throw new Error("Chave de cifra fraca: DATA_ENC_KEY/AUTH_SECRET deve ter ao menos 16 caracteres.");
  }
  _key = scryptSync(secret, "pronto-satisfacao:data-enc:v1", 32);
  return _key;
}

/** Verdadeiro se o valor já está no formato cifrado desta lib. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(token: string): string {
  if (!isEncrypted(token)) return token; // legado em texto puro
  const parts = token.split(":");
  if (parts.length !== 4) throw new Error("Token cifrado malformado.");
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** Cifra somente se ainda não estiver cifrado (idempotente). */
export function encryptIfNeeded(value: string): string {
  return isEncrypted(value) ? value : encrypt(value);
}

/**
 * Decifra retornando `null` em vez de lançar quando o valor está corrompido ou
 * a chave não bate (ex.: rotação de DATA_ENC_KEY). Útil em caminhos onde a
 * falha de decifragem NÃO deve virar um erro 500 (ex.: verificação de login).
 */
export function decryptSafe(token: string): string | null {
  try {
    return decrypt(token);
  } catch {
    return null;
  }
}
