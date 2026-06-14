import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

/**
 * Deriva o remotePattern do host de armazenamento (MinIO/S3) a partir de
 * MINIO_ENDPOINT. Em dev cai no localhost:9000; em produção usa o endpoint real.
 */
function storageRemotePattern(): RemotePattern {
  const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
  try {
    const url = new URL(endpoint);
    return {
      protocol: url.protocol.replace(":", "") === "https" ? "https" : "http",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
  } catch {
    return { protocol: "http", hostname: "localhost", port: "9000" };
  }
}

/**
 * Cabeçalhos de segurança aplicados a todas as rotas.
 *
 * A Content-Security-Policy é aplicada de forma *enforcing* globalmente. Para
 * evitar quebrar funcionalidades específicas, definimos duas variantes:
 *
 *  - CSP_BASE: política padrão para o app (admin/APIs internas).
 *  - CSP_RELAXED: usada em `/api/docs` (Swagger UI carregado de cdn.jsdelivr.net)
 *    e nas rotas de formulário público/embed, que precisam de img-src amplo e,
 *    no caso do embed, de ser carregadas dentro de um <iframe> de terceiros
 *    (por isso frame-ancestors é liberado nesses paths).
 *
 * Observações:
 *  - `script-src`/`style-src` incluem 'unsafe-inline' porque o Next.js injeta
 *    scripts/estilos inline em runtime e ainda não há suporte a nonce estável
 *    aqui; cdn.jsdelivr.net é necessário para o Swagger UI em /api/docs.
 *  - HSTS com preload: só tem efeito sob HTTPS; é ignorado em http (dev).
 */
const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// CSP para rotas de formulário público/embed: permite ser embutida em iframes
// de terceiros (frame-ancestors *) e mantém img-src amplo para logos/assets.
const CSP_EMBED = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors *",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// CSP para /api/docs (Swagger UI servido via cdn.jsdelivr.net).
const CSP_DOCS = CSP_BASE;

const COMMON_SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.qrserver.com" },
      // Host de armazenamento (MinIO/S3) derivado de MINIO_ENDPOINT.
      storageRemotePattern(),
    ],
  },
  async headers() {
    return [
      // Rotas de embed/formulário público: precisam ser embutíveis em iframe.
      // Headers comuns SEM X-Frame-Options DENY (que bloquearia o iframe) e com
      // CSP de embed (frame-ancestors *).
      {
        source: "/embed/:path*",
        headers: [
          ...COMMON_SECURITY_HEADERS.filter((h) => h.key !== "X-Frame-Options"),
          { key: "Content-Security-Policy", value: CSP_EMBED },
        ],
      },
      // Swagger UI em /api/docs (assets de cdn.jsdelivr.net já liberados no CSP).
      {
        source: "/api/docs/:path*",
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: "Content-Security-Policy", value: CSP_DOCS },
        ],
      },
      {
        source: "/api/docs",
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: "Content-Security-Policy", value: CSP_DOCS },
        ],
      },
      // Demais rotas: headers de segurança + CSP base (enforcing).
      // EXCLUI /embed e /api/docs (lookahead negativo) para NÃO reaplicar
      // X-Frame-Options: DENY / frame-ancestors 'none' sobre essas rotas (o
      // navegador trata múltiplos headers CSP como políticas independentes e
      // TODAS devem permitir — então a DENY do catch-all bloquearia o iframe).
      // `(?:/|$)` ancora o prefixo: exclui exatamente /embed e /embed/* (e
      // /api/docs, /api/docs/*) SEM excluir rotas vizinhas como /embedded ou
      // /api/docsX, que devem continuar recebendo o CSP base.
      {
        source: "/((?!embed(?:/|$)|api/docs(?:/|$)).*)",
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: "Content-Security-Policy", value: CSP_BASE },
        ],
      },
    ];
  },
  // Telemetria do Next.js é desativada via env NEXT_TELEMETRY_DISABLED=1
  // (definido no Dockerfile/ambiente de deploy); não há flag em config para isso.
};

export default nextConfig;
