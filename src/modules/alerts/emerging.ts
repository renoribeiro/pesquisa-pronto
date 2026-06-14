import { AlertType } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { isEmerging, DEFAULT_EMERGING } from "@/lib/topics";
import { notifyAlert } from "@/modules/notifications/service";

/**
 * Detecção de temas emergentes (AlertType.EMERGING_THEME).
 *
 * Dado o snapshot recém-calculado de temas (com volume atual, volume do período
 * anterior e tendência %), cria um Alert para cada tema que cruzou o limiar de
 * "emergência" — deduplicando por rótulo nas últimas 24h. Os limiares são lidos
 * do AlertThreshold do tenant (config `{ minVolume, minTrend }`); na ausência de
 * configuração, usa os padrões e permanece ativo (opt-out via active=false).
 */

export interface EmergingThemeInput {
  label: string;
  volume: number;
  prevVolume: number;
  trend: number;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function createEmergingThemeAlerts(
  db: TenantClient,
  tenantId: string,
  themes: EmergingThemeInput[],
): Promise<number> {
  if (themes.length === 0) return 0;

  const threshold = await db.alertThreshold.findFirst({
    where: { type: AlertType.EMERGING_THEME },
  });
  // Linha existente e desativada = recurso desligado para o tenant.
  if (threshold && threshold.active === false) return 0;

  const cfg =
    threshold?.config && typeof threshold.config === "object" && !Array.isArray(threshold.config)
      ? (threshold.config as Record<string, unknown>)
      : {};
  const minVolume = numberOr(cfg.minVolume, DEFAULT_EMERGING.minVolume);
  const minTrend = numberOr(cfg.minTrend, DEFAULT_EMERGING.minTrend);

  const emerging = themes.filter((t) => isEmerging(t.volume, t.prevVolume, t.trend, { minVolume, minTrend }));
  if (emerging.length === 0) return 0;

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  let created = 0;

  for (const t of emerging) {
    // Dedupe por rótulo nas últimas 24h (independente de status): o mesmo tema
    // não deve gerar alertas repetidos a cada execução do clustering.
    const existing = await db.alert.findFirst({
      where: {
        type: AlertType.EMERGING_THEME,
        createdAt: { gte: since },
        metadata: { path: ["label"], equals: t.label },
      },
    });
    if (existing) continue;

    const title = `Tema emergente: ${t.label}`;
    const message =
      t.prevVolume === 0
        ? `O tema "${t.label}" surgiu nos comentários recentes (${t.volume} menção${t.volume === 1 ? "" : "ões"}).`
        : `O tema "${t.label}" cresceu ${t.trend}% vs. o período anterior (${t.volume} menção${t.volume === 1 ? "" : "ões"}).`;
    const metadata = { label: t.label, volume: t.volume, prevVolume: t.prevVolume, trend: t.trend };

    await db.alert.create({
      data: { tenantId, type: AlertType.EMERGING_THEME, status: "OPEN", title, message, metadata },
    });
    await notifyAlert(db, tenantId, { alertType: AlertType.EMERGING_THEME, title, body: message, metadata });
    created += 1;
  }

  return created;
}
