import Link from "next/link";
import { LoginForm } from "@/modules/auth/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Entrar — Pronto Satisfação" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Pronto Satisfação</CardTitle>
        <CardDescription>Acesse o painel da clínica</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
        <p className="text-muted-foreground mt-4 text-center text-sm">
          <Link href="/forgot-password" className="underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
