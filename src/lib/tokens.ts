import { createHash, randomBytes } from "node:crypto";

/** Gera um token opaco (para reset de senha, convites, recipients). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash determinístico de um token para armazenamento (não reversível). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
