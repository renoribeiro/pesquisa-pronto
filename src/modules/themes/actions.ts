"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { audit } from "@/lib/audit";
import { themeConfigSchema } from "./theme-config";

const createSchema = z.object({
  name: z.string().min(1),
  config: themeConfigSchema,
  isDefault: z.boolean().default(false),
});

export async function createTheme(input: unknown): Promise<string> {
  const { ctx, db } = await requirePermission("survey:create");
  const data = createSchema.parse(input);
  if (data.isDefault) {
    await db.theme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }
  const theme = await db.theme.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      config: data.config,
      isDefault: data.isDefault,
    },
  });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "theme.create", entityId: theme.id });
  revalidatePath("/admin/themes");
  return theme.id;
}

const updateSchema = createSchema.extend({ id: z.string() });

export async function updateTheme(input: unknown) {
  const { ctx, db } = await requirePermission("survey:create");
  const data = updateSchema.parse(input);
  if (data.isDefault) {
    await db.theme.updateMany({
      where: { isDefault: true, NOT: { id: data.id } },
      data: { isDefault: false },
    });
  }
  await db.theme.update({
    where: { id: data.id },
    data: { name: data.name, config: data.config, isDefault: data.isDefault },
  });
  await audit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "theme.update", entityId: data.id });
  revalidatePath("/admin/themes");
}

export async function deleteTheme(id: string) {
  const { db } = await requirePermission("survey:create");
  await db.theme.delete({ where: { id } });
  revalidatePath("/admin/themes");
}
