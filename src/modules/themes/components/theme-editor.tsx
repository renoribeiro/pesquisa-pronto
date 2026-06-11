"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTheme, updateTheme } from "@/modules/themes/actions";
import { themeToStyleString, type ThemeConfig } from "@/modules/themes/theme-config";
import { THEME_PRESETS, GOOGLE_FONTS } from "@/modules/themes/presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ThemeEditor({
  themeId,
  initialName,
  initialConfig,
  initialDefault,
}: {
  themeId?: string;
  initialName: string;
  initialConfig: ThemeConfig;
  initialDefault: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [isDefault, setIsDefault] = useState(initialDefault);
  const [config, setConfig] = useState<ThemeConfig>(initialConfig);

  function setColor(key: keyof ThemeConfig["colors"], value: string) {
    setConfig({ ...config, colors: { ...config.colors, [key]: value } });
  }

  function save() {
    start(async () => {
      try {
        if (themeId) {
          await updateTheme({ id: themeId, name, config, isDefault });
          toast.success("Tema atualizado.");
        } else {
          const id = await createTheme({ name, config, isDefault });
          toast.success("Tema criado.");
          router.push(`/admin/themes/${id}`);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label>Nome do tema</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Temas prontos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((p) => (
              <Button key={p.key} variant="outline" size="sm" onClick={() => setConfig(p.config)}>
                {p.name}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cores</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {(
              [
                ["primary", "Primária"],
                ["secondary", "Secundária"],
                ["pageBg", "Fundo da página"],
                ["cardBg", "Fundo do card"],
                ["text", "Texto"],
                ["textMuted", "Texto secundário"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-8 w-10 rounded border"
                  />
                  <Input
                    value={config.colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tipografia & Layout</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Selector
              label="Fonte"
              value={config.typography.fontFamily}
              options={GOOGLE_FONTS.map((f) => [f, f])}
              onChange={(v) =>
                setConfig({ ...config, typography: { ...config.typography, fontFamily: v } })
              }
            />
            <Selector
              label="Tamanho base"
              value={config.typography.baseSize}
              options={[
                ["sm", "Pequeno"],
                ["md", "Médio"],
                ["lg", "Grande"],
              ]}
              onChange={(v) =>
                setConfig({
                  ...config,
                  typography: { ...config.typography, baseSize: v as ThemeConfig["typography"]["baseSize"] },
                })
              }
            />
            <Selector
              label="Cantos"
              value={config.layout.radius}
              options={[
                ["square", "Quadrado"],
                ["rounded", "Arredondado"],
                ["pill", "Pílula"],
              ]}
              onChange={(v) =>
                setConfig({ ...config, layout: { ...config.layout, radius: v as ThemeConfig["layout"]["radius"] } })
              }
            />
            <Selector
              label="Sombra"
              value={config.layout.shadow}
              options={[
                ["none", "Sem"],
                ["soft", "Suave"],
                ["strong", "Pronunciada"],
              ]}
              onChange={(v) =>
                setConfig({ ...config, layout: { ...config.layout, shadow: v as ThemeConfig["layout"]["shadow"] } })
              }
            />
            <Selector
              label="Espaçamento"
              value={config.layout.spacing}
              options={[
                ["compact", "Compacto"],
                ["normal", "Normal"],
                ["spacious", "Espaçoso"],
              ]}
              onChange={(v) =>
                setConfig({ ...config, layout: { ...config.layout, spacing: v as ThemeConfig["layout"]["spacing"] } })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">CSS avançado (opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              placeholder=".ps-card { ... }"
              value={config.customCss ?? ""}
              onChange={(e) => setConfig({ ...config, customCss: e.target.value })}
            />
          </CardContent>
        </Card>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Definir como tema padrão da clínica
        </label>
      </div>

      <div className="lg:sticky lg:top-4 lg:h-fit">
        <ThemePreview config={config} />
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <select
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ThemePreview({ config }: { config: ThemeConfig }) {
  return (
    <div
      style={{ background: "var(--ps-page-bg)" } as React.CSSProperties}
      data-theme-preview
    >
      <div style={{ all: "unset" }}>
        <style>{`[data-theme-preview]{${themeToStyleString(config)}}`}</style>
        {config.customCss ? <style>{config.customCss}</style> : null}
      </div>
      <div className="flex justify-center p-6" style={{ background: "var(--ps-page-bg)" }}>
        <div
          className="ps-card w-full"
          style={{
            maxWidth: "var(--ps-max-width)",
            background: "var(--ps-card-bg)",
            color: "var(--ps-text)",
            borderRadius: "var(--ps-radius)",
            boxShadow: "var(--ps-shadow)",
            padding: "var(--ps-spacing)",
            fontFamily: "var(--ps-font-family)",
            fontSize: "var(--ps-base-size)",
          }}
        >
          <h2 style={{ fontWeight: "var(--ps-heading-weight)" } as React.CSSProperties}>
            Como foi sua experiência?
          </h2>
          <p style={{ color: "var(--ps-text-muted)", marginTop: 4 }}>
            Sua opinião ajuda a Prontoclínica a melhorar.
          </p>
          <div className="mt-4 flex gap-2">
            {[8, 9, 10].map((n) => (
              <span
                key={n}
                style={{
                  display: "inline-flex",
                  height: 40,
                  width: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--ps-radius)",
                  background: n === 10 ? "var(--ps-primary)" : "transparent",
                  color: n === 10 ? "#fff" : "var(--ps-text)",
                  border: "1px solid var(--ps-secondary)",
                }}
              >
                {n}
              </span>
            ))}
          </div>
          <button
            className="mt-5"
            style={{
              background: "var(--ps-primary)",
              color: "#fff",
              borderRadius: "var(--ps-radius)",
              padding: "10px 18px",
              border: "none",
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
