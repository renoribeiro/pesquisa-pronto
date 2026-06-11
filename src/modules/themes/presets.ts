import type { ThemeConfig } from "./theme-config";

/** Temas prontos (escopo §3.3.2). */
export const THEME_PRESETS: { key: string; name: string; config: ThemeConfig }[] = [
  {
    key: "clinico",
    name: "🏥 Clínico",
    config: {
      colors: {
        primary: "#0f4c81",
        secondary: "#2f80ed",
        pageBg: "#f4f6f8",
        cardBg: "#ffffff",
        text: "#1f2937",
        textMuted: "#6b7280",
      },
      typography: { fontFamily: "Inter", baseSize: "md", headingWeight: "bold" },
      layout: { radius: "rounded", shadow: "soft", spacing: "normal", maxWidth: 560 },
    },
  },
  {
    key: "saude-natural",
    name: "🌿 Saúde Natural",
    config: {
      colors: {
        primary: "#2e7d52",
        secondary: "#7cb342",
        pageBg: "#f3f7f1",
        cardBg: "#ffffff",
        text: "#243024",
        textMuted: "#6b7c6b",
      },
      typography: { fontFamily: "Nunito", baseSize: "md", headingWeight: "bold" },
      layout: { radius: "rounded", shadow: "soft", spacing: "normal", maxWidth: 560 },
    },
  },
  {
    key: "dark-care",
    name: "🌙 Dark Care",
    config: {
      colors: {
        primary: "#14b8a6",
        secondary: "#0ea5e9",
        pageBg: "#0f172a",
        cardBg: "#1e293b",
        text: "#e2e8f0",
        textMuted: "#94a3b8",
      },
      typography: { fontFamily: "Inter", baseSize: "md", headingWeight: "bold" },
      layout: { radius: "rounded", shadow: "strong", spacing: "normal", maxWidth: 560 },
    },
  },
  {
    key: "acolhedor",
    name: "☀️ Acolhedor",
    config: {
      colors: {
        primary: "#ea7317",
        secondary: "#f4a259",
        pageBg: "#fdf6ef",
        cardBg: "#ffffff",
        text: "#3a2a1a",
        textMuted: "#8a7560",
      },
      typography: { fontFamily: "Poppins", baseSize: "md", headingWeight: "medium" },
      layout: { radius: "pill", shadow: "soft", spacing: "spacious", maxWidth: 560 },
    },
  },
  {
    key: "moderno",
    name: "⚡ Moderno",
    config: {
      colors: {
        primary: "#6d28d9",
        secondary: "#db2777",
        pageBg: "#faf5ff",
        cardBg: "#ffffff",
        text: "#1f1147",
        textMuted: "#6b7280",
      },
      typography: { fontFamily: "Poppins", baseSize: "lg", headingWeight: "bold" },
      layout: { radius: "rounded", shadow: "strong", spacing: "spacious", maxWidth: 600 },
    },
  },
];

export const DEFAULT_THEME_CONFIG = THEME_PRESETS[0].config;

/** Fontes Google curadas para o seletor de tipografia. */
export const GOOGLE_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Nunito",
  "Raleway",
  "Work Sans",
  "Source Sans 3",
  "Manrope",
  "DM Sans",
];
