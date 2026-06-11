import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.qrserver.com" },
      // MinIO (ajuste para o domínio de produção)
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },
  // Desativa telemetria
  experimental: {},
};

export default nextConfig;
