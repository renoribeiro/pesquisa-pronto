/**
 * Utilitários de escape para interpolação segura em HTML (e-mails, etc.).
 *
 * Use SEMPRE que inserir dados controlados pelo usuário (nome, título,
 * comentários) dentro de um template HTML construído por concatenação de
 * strings — caso contrário há injeção de HTML / phishing no corpo do e-mail.
 */

/** Escapa os 5 caracteres perigosos para conteúdo HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitiza uma URL para uso em `href`: só permite esquemas http/https.
 * Retorna `#` para qualquer coisa suspeita (javascript:, data:, etc.).
 */
export function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  if (/^https?:\/\//i.test(s)) return escapeHtml(s);
  return "#";
}
