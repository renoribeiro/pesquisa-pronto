import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/components/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Recuperar senha — Pronto Satisfação" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Recuperar senha</CardTitle>
        <CardDescription>Enviaremos um link para o seu email</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <p className="text-muted-foreground mt-4 text-center text-sm">
          <Link href="/login" className="underline underline-offset-4">
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
