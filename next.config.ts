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

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.qrserver.com" },
      // Host de armazenamento (MinIO/S3) derivado de MINIO_ENDPOINT.
      storageRemotePattern(),
    ],
  },
  // Telemetria do Next.js é desativada via env NEXT_TELEMETRY_DISABLED=1
  // (definido no Dockerfile/ambiente de deploy); não há flag em config para isso.
};

export default nextConfig;
