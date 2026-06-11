"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ReportType, ReportFormat } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { enqueueGenerateReport } from "@/server/queues";

const createReportSchema = z.object({
  type: z.nativeEnum(ReportType),
  format: z.nativeEnum(ReportFormat),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export async function createReport(input: unknown) {
  const { ctx, db } = await requirePermission("survey:export");
  const data = createReportSchema.parse(input);

  const report = await db.report.create({
    data: {
      tenantId: ctx.tenantId,
      type: data.type,
      format: data.format,
      filters: data.filters ?? {},
      status: "pending",
      generatedById: ctx.userId,
    },
  });

  await enqueueGenerateReport({ reportId: report.id, tenantId: ctx.tenantId });

  revalidatePath("/admin/reports");
  return report.id;
}

export async function getReports() {
  const { db } = await requirePermission("survey:export");
  return db.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { generatedBy: { select: { name: true } } },
  });
}
