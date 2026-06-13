"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { putObject, publicUrl } from "@/lib/storage";

const clinicSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  timezone: z.string().default("America/Fortaleza"),
});

export async function updateClinic(input: unknown) {
  const { ctx } = await requirePermission("system:configure");
  const data = clinicSchema.parse(input);
  // Atualiza apenas os campos gerais da clínica. privacyPolicy/retentionMonths
  // têm action dedicada (updatePrivacy) para não serem zerados a partir da aba Geral.
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      name: data.name,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      address: data.address || null,
      timezone: data.timezone,
    },
  });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "settings.clinic_updated" });
  revalidatePath("/admin/settings");
}

// ── Privacidade / LGPD ────────────────────────────────────────
const privacySchema = z.object({
  privacyPolicy: z.string().optional(),
  retentionMonths: z.coerce.number().int().min(1).max(120).default(24),
});

/**
 * Atualiza SOMENTE os campos de privacidade/LGPD. Não toca em
 * name/contactEmail/contactPhone/address/timezone, evitando que a aba LGPD
 * sobrescreva (apague) dados de contato da clínica.
 */
export async function updatePrivacy(input: unknown) {
  const { ctx } = await requirePermission("system:configure");
  const data = privacySchema.parse(input);
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      privacyPolicy: data.privacyPolicy || null,
      retentionMonths: data.retentionMonths,
    },
  });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "settings.privacy_updated" });
  revalidatePath("/admin/settings");
}

// Allowlist de tipos de imagem para o logo (MIME → extensão canônica).
const LOGO_ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const LOGO_ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadLogo(formData: FormData) {
  const { ctx } = await requirePermission("system:configure");
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Arquivo ausente");
  if (file.size > LOGO_MAX_BYTES) throw new Error("Arquivo muito grande (máx. 2 MB).");

  // Valida por allowlist de MIME E de extensão (não confia cego em file.type).
  const contentType = LOGO_ALLOWED[file.type];
  const rawExt = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!contentType || !LOGO_ALLOWED_EXT.has(rawExt)) {
    throw new Error("Formato inválido. Use PNG, JPEG, WebP ou SVG.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = contentType; // extensão canônica derivada do MIME validado
  const key = `tenants/${ctx.tenantId}/logo.${ext}`;
  await putObject(key, buffer, file.type);
  const url = publicUrl(key);
  await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { logoUrl: url } });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "settings.logo_updated" });
  revalidatePath("/admin/settings");
  return { url };
}

// ── Setores ───────────────────────────────────────────────────
const sectorSchema = z.object({ name: z.string().min(1) });

export async function createSector(input: unknown) {
  const { ctx, db } = await requirePermission("system:configure");
  const { name } = sectorSchema.parse(input);
  await db.sector.create({ data: { tenantId: ctx.tenantId, name, slug: slugify(name) } });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "sector.create",
    metadata: { name },
  });
  revalidatePath("/admin/settings");
}

export async function toggleSector(id: string, active: boolean) {
  const { db } = await requirePermission("system:configure");
  await db.sector.update({ where: { id }, data: { active } });
  revalidatePath("/admin/settings");
}

// ── Pontos de contato ─────────────────────────────────────────
const touchPointSchema = z.object({ name: z.string().min(1), icon: z.string().optional() });

export async function createTouchPoint(input: unknown) {
  const { ctx, db } = await requirePermission("system:configure");
  const { name, icon } = touchPointSchema.parse(input);
  await db.touchPoint.create({
    data: { tenantId: ctx.tenantId, name, slug: slugify(name), icon: icon || null },
  });
  await audit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "touchpoint.create",
    metadata: { name },
  });
  revalidatePath("/admin/settings");
}

export async function toggleTouchPoint(id: string, active: boolean) {
  const { db } = await requirePermission("system:configure");
  await db.touchPoint.update({ where: { id }, data: { active } });
  revalidatePath("/admin/settings");
}
