import { z } from "zod";

/**
 * Validação centralizada das variáveis de ambiente.
 * Falha cedo (no boot) se algo essencial estiver ausente/ inválido.
 *
 * Observação: variáveis usadas apenas no worker ou em features específicas
 * são marcadas como opcionais aqui e validadas no ponto de uso.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // MinIO / S3
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_BUCKET: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),

  // Auth
  AUTH_SECRET: z.string().min(1).optional(),

  // IA
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // WhatsApp
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  WHATSAPP_SURVEY_TEMPLATE: z.string().default("pesquisa_satisfacao"),

  // SMS
  SMS_PROVIDER: z.enum(["mock", "zenvia", "twilio"]).default("mock"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().optional(),

  // Webhooks
  AMIGO_TECH_WEBHOOK_SECRET: z.string().optional(),

  // Seed
  DEFAULT_TENANT_NAME: z.string().default("Prontoclínica de Fortaleza"),
  DEFAULT_TENANT_SLUG: z.string().default("prontoclinica"),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Falha na validação das variáveis de ambiente. Veja .env.example.");
}

export const env = parsed.data;
export type Env = typeof env;
