"use client";

import { LOCALES, LOCALE_LABELS, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

/**
 * Seletor de idioma do formulário público. Grava o locale escolhido no cookie
 * `NEXT_LOCALE` (1 ano) e recarrega para que o server component re-renderize com
 * o dicionário correto. Sem estado de servidor — puro cookie + reload.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <label className="inline-flex items-center gap-1 text-xs text-[#6E6565]">
      <span className="sr-only">Idioma</span>
      <select
        value={current}
        onChange={onChange}
        aria-label="Idioma"
        className="rounded-md border border-[#a8a0a0]/30 bg-background px-2 py-1 text-xs font-semibold text-[#3A3333]"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
