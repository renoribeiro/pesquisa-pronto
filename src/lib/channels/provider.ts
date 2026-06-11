/**
 * Abstração de canais de disparo.
 * Cada canal implementa `ChannelProvider` — a fila chama `send()` uniformemente.
 */

export interface SendParams {
  to: string;
  templateName?: string;
  variables?: Record<string, string>;
  body?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelProvider {
  send(params: SendParams): Promise<SendResult>;
}
