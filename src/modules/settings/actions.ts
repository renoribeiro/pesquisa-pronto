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
  privacyPolicy: z.string().optional(),
  retentionMonths: z.coerce.number().int().min(1).max(120).default(24),
});

export async function updateClinic(input: unknown) {
  const { ctx } = await requirePermission("system:configure");
  const data = clinicSchema.parse(input);
  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      name: data.name,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      address: data.address || null,
      timezone: data.timezone,
      privacyPolicy: data.privacyPolicy || null,
      retentionMonths: data.retentionMonths,
    },
  });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "settings.clinic_updated" });
  revalidatePath("/admin/settings");
}

export async function uploadLogo(formData: FormData) {
  const { ctx } = await requirePermission("system:configure");
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Arquivo ausente");
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? "png";
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
