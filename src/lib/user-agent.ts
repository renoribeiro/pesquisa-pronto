/** Parsing leve de user-agent para metadados (sem dependências externas). */
export function parseUserAgent(ua: string): {
  deviceType: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
} {
  const s = ua.toLowerCase();
  const isTablet = /ipad|tablet/.test(s);
  const isMobile = /mobi|iphone|android.*mobile/.test(s);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let os = "Desconhecido";
  if (/windows/.test(s)) os = "Windows";
  else if (/iphone|ipad|ios/.test(s)) os = "iOS";
  else if (/mac os/.test(s)) os = "macOS";
  else if (/android/.test(s)) os = "Android";
  else if (/linux/.test(s)) os = "Linux";

  let browser = "Desconhecido";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";

  return { deviceType, os, browser };
}
