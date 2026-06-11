import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware edge-safe: usa apenas a config sem providers Node.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protege o painel admin; ignora assets, API e formulário público.
  matcher: ["/admin/:path*"],
};
