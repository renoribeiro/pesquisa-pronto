import { getSessionContext } from "@/lib/session";
import { forTenant } from "@/lib/tenant";

// SSE long-lived → runtime Node + sempre dinâmico (nunca cacheado/pré-renderizado).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 10_000;

/**
 * Stream SSE da contagem de notificações não-lidas do usuário autenticado.
 * Emite `unread` no início e a cada ~10s; o cliente atualiza o badge e recarrega
 * a lista quando a contagem sobe. Fecha ao abortar (cliente desconecta).
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const db = forTenant(ctx.tenantId);
  const encoder = new TextEncoder();
  const where = { userId: ctx.userId, read: false, archived: false } as const;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        try {
          const count = await db.notification.count({ where });
          send("unread", { count });
        } catch {
          // Falha transitória de DB: mantém a conexão; tenta no próximo ciclo.
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        try {
          controller.close();
        } catch {
          // já fechado
        }
      };

      // Registra o cleanup ANTES de qualquer await: se o cliente já abortou (ou
      // abortar durante o primeiro tick), não deixamos o setInterval órfão.
      if (req.signal.aborted) {
        cleanup();
        return;
      }
      req.signal.addEventListener("abort", cleanup);

      await tick();
      if (closed) return; // abortou durante o primeiro tick
      interval = setInterval(tick, POLL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
