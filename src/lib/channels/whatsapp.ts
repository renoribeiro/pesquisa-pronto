/**
 * WhatsApp Business API (Meta Cloud API).
 * Requer: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID nas variáveis de ambiente.
 */

import { env } from "@/lib/env";
import type { ChannelProvider, SendParams, SendResult } from "./provider";

const REQUEST_TIMEOUT_MS = 10_000;

export class WhatsAppProvider implements ChannelProvider {
  private readonly token: string;
  private readonly phoneId: string;

  constructor(token: string, phoneId: string) {
    this.token = token;
    this.phoneId = phoneId;
  }

  async send({ to, templateName, variables }: SendParams): Promise<SendResult> {
    if (!templateName) {
      return { success: false, error: "WhatsApp requer um templateName HSM aprovado." };
    }

    // A ordem dos parâmetros do template é posicional ({{1}}, {{2}}, ...) e NÃO
    // pode depender da ordem de iteração das chaves do objeto. Ordena de forma
    // determinística pelo índice numérico da chave (fallback lexicográfico para
    // chaves não numéricas).
    const components = variables
      ? Object.entries(variables)
          .sort(([a], [b]) => {
            const na = Number(a);
            const nb = Number(b);
            if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
            return na - nb;
          })
          .map(([, text]) => ({ type: "text", text }))
      : [];

    const payload = {
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: "pt_BR" },
        components: components.length
          ? [{ type: "body", parameters: components }]
          : [],
      },
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${this.phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `WhatsApp API error ${res.status}: ${body}` };
      }

      const data = (await res.json()) as { messages?: { id: string }[] };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class WhatsAppMockProvider implements ChannelProvider {
  async send({ to, templateName }: SendParams): Promise<SendResult> {
    console.log(`[whatsapp:mock] → ${to} template=${templateName ?? "(sem template)"}`);
    return { success: true, messageId: `mock_${Date.now()}` };
  }
}

export function getWhatsAppProvider(): ChannelProvider {
  const token = env.WHATSAPP_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneId) return new WhatsAppProvider(token, phoneId);
  return new WhatsAppMockProvider();
}
