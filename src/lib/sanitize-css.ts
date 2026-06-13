/**
 * Sanitização do CSS customizado de tema (`customCss`).
 *
 * O `customCss` é definido por usuários do tenant e renderizado dentro de uma
 * tag <style> no formulário público (página acessível por respondentes não
 * autenticados). CSS arbitrário permite exfiltração de dados (via `url()` em
 * seletores de atributo), UI-redress/clickjacking e carregamento de recursos
 * externos. O React já impede breakout da tag <style> (escapa `<`/`>`), então
 * não há execução de JavaScript — o risco é injeção de CSS.
 *
 * Estratégia (blocklist conservadora + limite de tamanho):
 *  - remove at-rules perigosas (@import, @charset, @namespace, @document);
 *  - remove `url(...)`, `expression(...)`, `behavior:`, `javascript:`;
 *  - remove comentários (podem esconder payloads);
 *  - limita o tamanho total.
 *
 * Para escopo total dos seletores ao wrapper, o ideal futuro é um parser CSS
 * (postcss) prefixando `[data-survey-wrapper]`; aqui priorizamos bloquear os
 * vetores de exfiltração/recursos externos.
 */

const MAX_LEN = 20_000;

export function sanitizeCustomCss(css: string | null | undefined): string {
  if (!css) return "";
  let out = String(css).slice(0, MAX_LEN);

  // Remove comentários /* ... */ (evita ofuscação de payload).
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove at-rules perigosas (linha inteira até ; ou bloco {...}).
  out = out.replace(/@(import|charset|namespace|document|font-face)\b[^;{]*(;|\{[^}]*\})/gi, "");

  // Remove url(...) — vetor de exfiltração e carregamento externo.
  out = out.replace(/url\s*\([^)]*\)/gi, "none");

  // Remove construções legadas perigosas.
  out = out.replace(/expression\s*\([^)]*\)/gi, "");
  out = out.replace(/behavior\s*:/gi, "");
  out = out.replace(/-moz-binding\s*:/gi, "");

  // Neutraliza esquemas perigosos remanescentes.
  out = out.replace(/javascript\s*:/gi, "");

  // Defesa extra: se sobrou qualquer `</style`, neutraliza (React já escaparia,
  // mas mantemos por robustez caso o sink mude).
  out = out.replace(/<\s*\/?\s*style/gi, "");

  return out.trim();
}
