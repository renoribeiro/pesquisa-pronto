import { z } from "zod";

/**
 * Configuração de tema (escopo §3.3). Estrutura validada e convertida em
 * CSS variables aplicadas no formulário público.
 */
export const themeConfigSchema = z.object({
  colors: z.object({
    primary: z.string().default("#0f4c81"),
    secondary: z.string().default("#2f80ed"),
    pageBg: z.string().default("#f4f6f8"),
    cardBg: z.string().default("#ffffff"),
    text: z.string().default("#1f2937"),
    textMuted: z.string().default("#6b7280"),
  }),
  typography: z.object({
    fontFamily: z.string().default("Inter"),
    baseSize: z.enum(["sm", "md", "lg"]).default("md"),
    headingWeight: z.enum(["regular", "medium", "bold"]).default("bold"),
  }),
  layout: z.object({
    radius: z.enum(["square", "rounded", "pill"]).default("rounded"),
    shadow: z.enum(["none", "soft", "strong"]).default("soft"),
    spacing: z.enum(["compact", "normal", "spacious"]).default("normal"),
    maxWidth: z.number().int().min(360).max(960).default(560),
  }),
  customCss: z.string().optional(),
});

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

const RADIUS_MAP = { square: "0px", rounded: "12px", pill: "9999px" };
const SHADOW_MAP = {
  none: "none",
  soft: "0 1px 3px rgba(0,0,0,0.1)",
  strong: "0 10px 30px rgba(0,0,0,0.18)",
};
const BASE_SIZE_MAP = { sm: "14px", md: "16px", lg: "18px" };
const WEIGHT_MAP = { regular: "400", medium: "500", bold: "700" };
const SPACING_MAP = { compact: "0.75rem", normal: "1.25rem", spacious: "2rem" };

/** Converte a config em um objeto de CSS custom properties (com prefixo --ps-). */
export function themeToCssVars(config: ThemeConfig): Record<string, string> {
  return {
    "--ps-primary": config.colors.primary,
    "--ps-secondary": config.colors.secondary,
    "--ps-page-bg": config.colors.pageBg,
    "--ps-card-bg": config.colors.cardBg,
    "--ps-text": config.colors.text,
    "--ps-text-muted": config.colors.textMuted,
    "--ps-font-family": `"${config.typography.fontFamily}", system-ui, sans-serif`,
    "--ps-base-size": BASE_SIZE_MAP[config.typography.baseSize],
    "--ps-heading-weight": WEIGHT_MAP[config.typography.headingWeight],
    "--ps-radius": RADIUS_MAP[config.layout.radius],
    "--ps-shadow": SHADOW_MAP[config.layout.shadow],
    "--ps-spacing": SPACING_MAP[config.layout.spacing],
    "--ps-max-width": `${config.layout.maxWidth}px`,
  };
}

/** Serializa as CSS vars como string inline para o atributo style. */
export function themeToStyleString(config: ThemeConfig): string {
  return Object.entries(themeToCssVars(config))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
