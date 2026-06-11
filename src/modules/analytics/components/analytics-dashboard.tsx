"use client";

import type {
  NpsSummary,
  ResponsesByDay,
  ChannelBreakdown,
} from "@/modules/analytics/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── NPS Score card ─────────────────────────────────────────────

export function NpsCard({ data }: { data: NpsSummary }) {
  const color =
    data.score >= 50
      ? "text-green-600"
      : data.score >= 0
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">NPS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-5xl font-bold", color)}>{data.score}</div>
        <p className="mt-1 text-xs text-muted-foreground">de {data.total} respostas</p>
        <div className="mt-3 flex gap-3 text-xs">
          <span className="text-green-600">▲ {data.promoters} promotores</span>
          <span className="text-gray-500">● {data.passives} passivos</span>
          <span className="text-red-600">▼ {data.detractors} detratores</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sparkline (pure CSS bar chart) ────────────────────────────

export function ResponseTrendChart({ data }: { data: ResponsesByDay[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Respostas por dia (30d)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
        ) : (
          <div className="flex h-24 items-end gap-0.5">
            {data.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count}`}
                className="flex-1 rounded-t bg-primary opacity-80 transition-all hover:opacity-100"
                style={{ height: `${(d.count / max) * 100}%`, minWidth: 2 }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Channel breakdown ─────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  LINK: "Link",
  QR_CODE: "QR Code",
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMBED: "Embed",
};

export function ChannelChart({ data }: { data: ChannelBreakdown[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Canal</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="space-y-2">
            {data.map((d) => (
              <div key={d.channel} className="flex items-center gap-2 text-sm">
                <div className="w-20 shrink-0 text-muted-foreground">
                  {CHANNEL_LABELS[d.channel] ?? d.channel}
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${(d.count / total) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-xs text-muted-foreground">{d.count}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent responses feed ─────────────────────────────────────

interface RecentResponse {
  id: string;
  createdAt: Date;
  channel: string;
  deviceType: string | null;
  npsScore: number | null;
  survey: { title: string };
}

export function RecentResponsesFeed({ data }: { data: RecentResponse[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Respostas recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{r.survey.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.createdAt.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {CHANNEL_LABELS[r.channel] ?? r.channel}
                    {r.deviceType ? ` · ${r.deviceType}` : ""}
                  </p>
                </div>
                {r.npsScore !== null ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      r.npsScore >= 9
                        ? "border-green-500 text-green-600"
                        : r.npsScore >= 7
                          ? "border-yellow-500 text-yellow-600"
                          : "border-red-500 text-red-600",
                    )}
                  >
                    NPS {r.npsScore}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
