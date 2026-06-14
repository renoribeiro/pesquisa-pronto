import { describe, it, expect } from "vitest";
import { resolveLocale, getDictionary, interpolate, DEFAULT_LOCALE } from "@/lib/i18n";

describe("resolveLocale", () => {
  it("resolve prefixos de idioma", () => {
    expect(resolveLocale("pt-BR")).toBe("pt-BR");
    expect(resolveLocale("pt")).toBe("pt-BR");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("es-419")).toBe("es");
  });
  it("cai no padrão para valores ausentes/desconhecidos", () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("fr")).toBe(DEFAULT_LOCALE);
  });
});

describe("getDictionary", () => {
  it("retorna o dicionário do locale e traduz o título de agradecimento", () => {
    expect(getDictionary("pt-BR").form.thankYouTitle).toBe("Obrigado!");
    expect(getDictionary("en").form.thankYouTitle).toBe("Thank you!");
    expect(getDictionary("es").form.thankYouTitle).toBe("¡Gracias!");
  });
  it("expõe as mesmas chaves em todos os locales", () => {
    const keys = (l: "pt-BR" | "en" | "es") => Object.keys(getDictionary(l).form).sort();
    expect(keys("en")).toEqual(keys("pt-BR"));
    expect(keys("es")).toEqual(keys("pt-BR"));
  });
});

describe("interpolate", () => {
  it("substitui placeholders nomeados", () => {
    expect(interpolate("Pergunta {current} de {total}", { current: 2, total: 5 })).toBe(
      "Pergunta 2 de 5",
    );
  });
  it("mantém placeholders sem valor", () => {
    expect(interpolate("{a} e {b}", { a: "x" })).toBe("x e {b}");
  });
});
