import { NextResponse } from "next/server";
import { enqueuePing } from "@/server/queues";

/**
 * Smoke test do pipeline de filas (somente desenvolvimento).
 * POST /api/dev/ping  → enfileira um job "ping" processado pelo worker.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Indisponível em produção" }, { status: 404 });
  }

  let message = "hello";
  try {
    const body = (await request.json()) as { message?: string };
    if (body?.message) message = body.message;
  } catch {
    // corpo vazio é aceitável
  }

  const job = await enqueuePing(message);
  return NextResponse.json({ enqueued: true, jobId: job.id, message });
}
