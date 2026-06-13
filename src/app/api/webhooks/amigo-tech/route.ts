import { type NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { forTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import { escapeHtml, safeHref } from "@/lib/html";
import { enqueueEmail } from "@/server/queues";

/**
 * POST /api/webhooks/amigo-tech
 * Recebe atendimento concluído do sistema Amigo Tech e enfileira pesquisa de satisfação.
 *
 * Contrato (mock — substituir com documentação real quando disponível):
 * {
 *   "event": "appointment.completed",
 *   "tenantSlug": "prontoclinica",
 *   "patient": { "name": "...", "email": "...", "phone": "..." },
 *   "appointment": { "id": "...", "sector": "...", "completedAt": "..." }
 * }
 */

const eventSchema = z.object({
  event: z.string(),
  tenantSlug: z.string(),
  patient: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  appointment: z.object({
    id: z.string(),
    sector: z.string().optional(),
    completedAt: z.string(),
  }),
});

/** Comparação de assinaturas em tempo constante, segura contra tamanhos divergentes. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  // timingSafeEqual lança RangeError se os tamanhos diferem — guard explícito.
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const secret = env.AMIGO_TECH_WEBHOOK_SECRET;

  // Em produção, a assinatura é obrigatória: sem secret configurado, rejeita.
  if (!secret) {
    if (env.NODE_ENV === "production") {
      return Response.json(
        { error: "Webhook secret not configured" },
        { status: 503 },
      );
    }
    // Apenas em dev/test aceitamos payloads não assinados para facilitar testes.
    const payload = await req.json().catch(() => null);
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });
    return handleEvent(parsed.data);
  }

  // Verify signature (HMAC-SHA256)
  const sig = req.headers.get("x-amigo-tech-signature") ?? "";
  const body = await req.text();
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (!safeEqualHex(sig, expected)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const payload = JSON.parse(body) as unknown;
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });
  return handleEvent(parsed.data);
}

async function handleEvent(data: z.infer<typeof eventSchema>) {
  if (data.event !== "appointment.completed") {
    return Response.json({ ok: true, skipped: true });
  }

  // Find tenant by slug — lookup cross-tenant consciente (slug global).
  const tenant = await prisma.tenant.findFirst({
    where: { slug: data.tenantSlug },
    select: { id: true },
  });
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  // A partir daqui, todos os modelos com tenantId devem passar pelo guard.
  const db = forTenant(tenant.id);

  // Idempotência: evita reprocessar o mesmo appointment.id (entregas duplicadas
  // do Amigo Tech / retries). Procuramos um WebhookLog "in" já gravado para este
  // evento + appointment.id. O guard de tenant já injeta o tenantId no where.
  const existing = await db.webhookLog
    .findFirst({
      where: {
        direction: "in",
        event: data.event,
        payload: {
          path: ["appointment", "id"],
          equals: data.appointment.id,
        },
      },
      select: { id: true },
    })
    .catch((err: unknown) => {
      logger.error("amigo-tech webhook: falha ao checar idempotência", err);
      return null;
    });

  if (existing) {
    return Response.json({ ok: true, duplicate: true });
  }

  // Find active survey (first active survey linked to the sector if possible)
  const survey = await db.survey.findFirst({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, slug: true },
  });

  if (!survey) {
    return Response.json({ ok: true, note: "No active survey" });
  }

  // Log webhook (marca o appointment como processado — base da idempotência).
  await db.webhookLog
    .create({
      data: {
        tenantId: tenant.id,
        event: data.event,
        payload: data as object,
        direction: "in",
        success: true,
      },
    })
    .catch((err: unknown) => {
      // Não engolir silenciosamente: registrar para diagnóstico.
      logger.error("amigo-tech webhook: falha ao gravar WebhookLog", err);
    });

  // Slug é controlado, mas codificamos por segurança ao montar a URL.
  const surveyUrl = `${env.APP_URL}/p/${encodeURIComponent(survey.slug)}`;

  // Send email if patient has email
  if (data.patient.email) {
    await enqueueEmail({
      to: data.patient.email,
      subject: `Pesquisa de satisfação — ${survey.title}`,
      html: buildEmail(survey.title, data.patient.name, surveyUrl),
      text: `Olá${data.patient.name ? ` ${data.patient.name}` : ""}! Responda nossa pesquisa: ${surveyUrl}`,
    });
  }

  return Response.json({ ok: true, surveyId: survey.id });
}

function buildEmail(title: string, name: string | undefined, url: string): string {
  // Dados vindos de terceiro (título da pesquisa, nome do paciente, URL) precisam
  // ser escapados antes de entrar no HTML, sob pena de injeção / phishing.
  const safeTitle = escapeHtml(title);
  const safeName = name ? escapeHtml(name) : "";
  const href = safeHref(url);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2>${safeTitle}</h2>
  <p>Olá${safeName ? ` <strong>${safeName}</strong>` : ""},</p>
  <p>Agradecemos por sua visita à Prontoclínica. Sua opinião é muito importante para nós.</p>
  <p style="margin:32px 0">
    <a href="${href}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Responder pesquisa
    </a>
  </p>
</body>
</html>`;
}
