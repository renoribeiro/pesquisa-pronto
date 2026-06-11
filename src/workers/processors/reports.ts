import type { Job } from "bullmq";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { putObject, getObjectUrl } from "@/lib/storage";
import type { GenerateReportJob } from "@/server/queues";

export async function processReport(job: Job): Promise<unknown> {
  if (job.name !== "generate") return null;
  return generateReport(job.data as GenerateReportJob);
}

async function generateReport({ reportId, tenantId }: GenerateReportJob) {
  const report = await prisma.report.findFirst({ where: { id: reportId, tenantId } });
  if (!report) {
    console.warn(`[worker:reports] report ${reportId} não encontrado`);
    return null;
  }

  await prisma.report.update({ where: { id: reportId }, data: { status: "generating" } });

  try {
    let fileUrl: string | null = null;

    if (report.format === "EXCEL" || report.format === "CSV") {
      fileUrl = await generateExcelReport(reportId, tenantId, report.type);
    } else {
      fileUrl = await generateTextReport(reportId, tenantId, report.type);
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { status: "ready", fileUrl },
    });

    await prisma.reportRun.create({
      data: {
        tenantId,
        reportId,
        status: "success",
      },
    });

    console.log(`[worker:reports] relatório ${reportId} gerado: ${fileUrl}`);
    return { reportId, fileUrl };
  } catch (err) {
    await prisma.report.update({ where: { id: reportId }, data: { status: "failed" } });
    await prisma.reportRun.create({
      data: {
        tenantId,
        reportId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function generateExcelReport(
  reportId: string,
  tenantId: string,
  type: string,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pronto Satisfação";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Respostas");

  if (type === "RESPONSES_RAW") {
    const responses = await prisma.response.findMany({
      where: { tenantId, completed: true },
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: {
        survey: { select: { title: true } },
        answers: {
          include: { question: { select: { title: true, type: true } } },
        },
      },
    });

    const questionSet = new Map<string, string>();
    for (const r of responses) {
      for (const a of r.answers) {
        questionSet.set(a.questionId, a.question.title);
      }
    }
    const questionIds = [...questionSet.keys()];

    sheet.columns = [
      { header: "ID", key: "id", width: 24 },
      { header: "Pesquisa", key: "survey", width: 30 },
      { header: "Data", key: "date", width: 20 },
      { header: "Canal", key: "channel", width: 12 },
      { header: "Dispositivo", key: "device", width: 12 },
      { header: "NPS", key: "nps", width: 6 },
      ...questionIds.map((qid) => ({
        header: questionSet.get(qid) ?? qid,
        key: `q_${qid}`,
        width: 30,
      })),
    ];

    for (const r of responses) {
      const ansMap = new Map(r.answers.map((a) => [a.questionId, a.value]));
      const row: Record<string, unknown> = {
        id: r.id,
        survey: r.survey.title,
        date: r.createdAt.toISOString(),
        channel: r.channel,
        device: r.deviceType ?? "",
        nps: r.npsScore ?? "",
      };
      for (const qid of questionIds) {
        const val = ansMap.get(qid);
        row[`q_${qid}`] = val != null ? JSON.stringify(val) : "";
      }
      sheet.addRow(row);
    }
  } else {
    const responses = await prisma.response.findMany({
      where: { tenantId, completed: true, npsScore: { not: null } },
      select: { npsScore: true, createdAt: true, channel: true },
    });

    sheet.columns = [
      { header: "Data", key: "date", width: 12 },
      { header: "NPS Score", key: "nps", width: 10 },
      { header: "Canal", key: "channel", width: 12 },
    ];

    for (const r of responses) {
      sheet.addRow({
        date: r.createdAt.toISOString().slice(0, 10),
        nps: r.npsScore,
        channel: r.channel,
      });
    }
  }

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6366F1" },
  };
  sheet.getRow(1).fill = headerFill;

  const buffer = await workbook.xlsx.writeBuffer();
  const key = `reports/${tenantId}/${reportId}.xlsx`;
  await putObject(key, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return getObjectUrl(key, 7 * 24 * 3600);
}

async function generateTextReport(
  reportId: string,
  tenantId: string,
  type: string,
): Promise<string> {
  const count = await prisma.response.count({ where: { tenantId, completed: true } });
  const content = `RELATÓRIO ${type}\nGerado em: ${new Date().toISOString()}\nTotal de respostas: ${count}\n`;
  const key = `reports/${tenantId}/${reportId}.txt`;
  await putObject(key, Buffer.from(content, "utf-8"), "text/plain");
  return getObjectUrl(key, 7 * 24 * 3600);
}
