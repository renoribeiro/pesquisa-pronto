/**
 * SMS via provider abstrato. Mock por padrão (sem credenciais reais).
 * Implementação real: Zenvia ou Twilio.
 */

import { env } from "@/lib/env";
import type { ChannelProvider, SendParams, SendResult } from "./provider";

const REQUEST_TIMEOUT_MS = 10_000;

export class SmsMockProvider implements ChannelProvider {
  async send({ to, body }: SendParams): Promise<SendResult> {
    console.log(`[sms:mock] → ${to}: ${body?.slice(0, 80) ?? "(sem corpo)"}`);
    return { success: true, messageId: `sms_mock_${Date.now()}` };
  }
}

// Placeholder para integração real (Zenvia/Twilio)
export class ZenviaProvider implements ChannelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send({ to, body }: SendParams): Promise<SendResult> {
    if (!body) return { success: false, error: "SMS requer corpo da mensagem." };

    try {
      const res = await fetch("https://api.zenvia.com/v2/channels/sms/messages", {
        method: "POST",
        headers: {
          "X-API-TOKEN": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to,
          contents: [{ type: "text", text: body }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const txt = await res.text();
        return { success: false, error: `Zenvia error ${res.status}: ${txt}` };
      }

      const data = (await res.json()) as { id?: string };
      return { success: true, messageId: data.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function getSmsProvider(): ChannelProvider {
  const apiKey = env.SMS_API_KEY;
  const from = env.SMS_SENDER;
  if (env.SMS_PROVIDER === "zenvia" && apiKey && from) {
    return new ZenviaProvider(apiKey, from);
  }
  return new SmsMockProvider();
}
