import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

export interface ApiContext {
  tenantId: string;
  keyId: string;
}

export async function authenticateApiKey(req: NextRequest): Promise<ApiContext | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash: tokenHash, active: true },
    select: { id: true, tenantId: true },
  });

  if (!apiKey) return null;

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => null);

  return { tenantId: apiKey.tenantId, keyId: apiKey.id };
}

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
