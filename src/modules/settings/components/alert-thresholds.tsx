"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertAlertThreshold } from "@/modules/alerts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AlertTypeKey = "DETRACTOR" | "NEGATIVE_TREND" | "EMERGING_THEME" | "LOW_VOLUME";

export interface ThresholdData {
  type: AlertTypeKey;
  active: boolean;
  config: Record<string, unknown>;
}

interface NumberField {
  key: string;
  label: string;
  default: number;
  hint?: string;
}

interface ThresholdMeta {
  type: AlertTypeKey;
  title: string;
  description: string;
  numberFields: NumberField[];
  /** Campo de telefones (string CSV) — só para DETRACTOR (close-loop WhatsApp). */
  hasPhones?: boolean;
}

const META: ThresholdMeta[] = [
  {
    type: "DETRACTOR",
    title: "Detrator",
    description: "Dispara quando uma resposta tem NPS abaixo do limiar.",
    numberFields: [{ key: "below", label: "NPS abaixo de", default: 7 }],
    hasPhones: true,
  },
  {
    type: "NEGATIVE_TREND",
    title: "Tendência negativa",
    description: "Dispara quando o NPS cai além do limiar entre semanas.",
    numberFields: [{ key: "minDrop", label: "Queda mínima (pontos)", default: 10 }],
  },
  {
    type: "EMERGING_THEME",
    title: "Tema emergente",
    description: "Dispara quando um tema novo surge ou cresce acima do limiar.",
    numberFields: [
      { key: "minVolume", label: "Volume mínimo", default: 3 },
      { key: "minTrend", label: "Crescimento mínimo (%)", default: 100 },
    ],
  },
  {
    type: "LOW_VOLUME",
    title: "Volume baixo",
    description: "Dispara quando as respostas da semana caem abaixo do esperado.",
    numberFields: [{ key: "minPerWeek", label: "Mínimo por semana", default: 5 }],
  },
];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ThresholdCard({ meta, initial }: { meta: ThresholdMeta; initial?: ThresholdData }) {
  const [active, setActive] = useState(initial?.active ?? true);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(meta.numberFields.map((f) => [f.key, num(initial?.config?.[f.key], f.default)])),
  );
  const [phones, setPhones] = useState<string>(
    typeof initial?.config?.notificationPhones === "string"
      ? (initial.config.notificationPhones as string)
      : "",
  );
  const [pending, start] = useTransition();

  function save() {
    const config: Record<string, number | string> = { ...values };
    if (meta.hasPhones && phones.trim()) config.notificationPhones = phones.trim();
    start(async () => {
      try {
        await upsertAlertThreshold({ type: meta.type, active, config });
        toast.success(`Limiar de ${meta.title} salvo.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar limiar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {meta.title}
          <Switch checked={active} onCheckedChange={setActive} />
        </CardTitle>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.numberFields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${meta.type}-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={`${meta.type}-${f.key}`}
                type="number"
                value={values[f.key]}
                disabled={!active}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>
        {meta.hasPhones && (
          <div className="space-y-1.5">
            <Label htmlFor={`${meta.type}-phones`} className="text-xs">
              Telefones para alerta no WhatsApp{" "}
              <span className="text-muted-foreground">(separados por vírgula)</span>
            </Label>
            <Input
              id={`${meta.type}-phones`}
              value={phones}
              disabled={!active}
              placeholder="5585996227722, 5585999990000"
              onChange={(e) => setPhones(e.target.value)}
            />
          </div>
        )}
        <Button onClick={save} disabled={pending} size="sm">
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function AlertThresholdsManager({ initial }: { initial: ThresholdData[] }) {
  const byType = new Map(initial.map((t) => [t.type, t]));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure quando cada alerta inteligente é disparado. Desative um tipo para silenciá-lo.
      </p>
      {META.map((meta) => (
        <ThresholdCard key={meta.type} meta={meta} initial={byType.get(meta.type)} />
      ))}
    </div>
  );
}
