import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Transporte de email transacional (reset de senha, convites, relatórios).
 * Em dev aponta para o Mailpit (localhost:1025); em prod, SMTP Hostgator.
 *
 * O transporte é criado preguiçosamente para não abrir conexão no import.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = env.SMTP_PORT ?? 1025;
  // TLS:
  //  - 465  → TLS implícito desde a conexão (`secure: true`).
  //  - 587  → conexão em texto puro + upgrade via STARTTLS (`secure: false` +
  //           `requireTLS: true`), o padrão de submissão de e-mail.
  //  - demais portas (ex.: 1025 do Mailpit em dev) → sem TLS.
  const secure = port === 465;
  const requireTLS = port === 587;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST ?? "localhost",
    port,
    secure,
    requireTLS,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const from = env.SMTP_FROM ?? "Pronto Satisfação <no-reply@localhost>";
  await getTransporter().sendMail({ from, ...msg });
}

/** Verifica conectividade SMTP (usado no teste de canal). */
export async function verifyMailer(): Promise<boolean> {
  try {
    await getTransporter().verify();
    return true;
  } catch {
    return false;
  }
}
