import { logger } from "@/lib/logger";

/**
 * Seam de observabilidade — ponto ÚNICO de integração com um coletor de erros
 * externo (ex.: Sentry). Por padrão apenas registra via `logger`; quando um sink
 * externo é registrado (em instrumentation), os erros também são exportados.
 *
 * Manter este seam evita acoplar a aplicação a um SDK específico: o worker e as
 * rotas chamam `captureException`/`captureMessage`, e a fiação do provedor fica
 * isolada aqui.
 *
 * Para habilitar o Sentry (quando houver DSN/conta):
 *   1. `npm i @sentry/nextjs`
 *   2. em `src/instrumentation.ts`:
 *        import * as Sentry from "@sentry/nextjs";
 *        import { registerErrorSink } from "@/lib/observability";
 *        if (env.SENTRY_DSN) {
 *          Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.1 });
 *          registerErrorSink((e, ctx) => Sentry.captureException(e, { extra: ctx }));
 *        }
 */

type ErrorContext = Record<string, unknown>;
type ErrorSink = (error: unknown, context?: ErrorContext) => void;

let externalSink: ErrorSink | null = null;

/** Registra um coletor externo de erros (ex.: Sentry). Idempotente. */
export function registerErrorSink(sink: ErrorSink): void {
  externalSink = sink;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Reporta uma exceção: sempre via `logger.error`; e, se houver sink externo,
 * exporta também. O reporter NUNCA propaga falhas próprias (não pode derrubar o
 * fluxo que o invocou).
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  logger.error(toMessage(error), context ?? {});
  if (externalSink) {
    try {
      externalSink(error, context);
    } catch {
      /* swallow — o coletor de erros não pode causar erros */
    }
  }
}

/** Reporta uma mensagem de atenção (warning) com a mesma semântica. */
export function captureMessage(message: string, context?: ErrorContext): void {
  logger.warn(message, context ?? {});
  if (externalSink) {
    try {
      externalSink(new Error(message), context);
    } catch {
      /* swallow */
    }
  }
}
