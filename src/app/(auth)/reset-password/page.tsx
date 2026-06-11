import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Redefinir senha — Pronto Satisfação" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Redefinir senha</CardTitle>
        <CardDescription>Escolha uma nova senha</CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-destructive text-center text-sm">Link inválido (token ausente).</p>
        )}
      </CardContent>
    </Card>
  );
}
