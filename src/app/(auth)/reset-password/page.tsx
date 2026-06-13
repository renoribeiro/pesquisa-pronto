import { ResetPasswordForm } from "@/modules/auth/components/reset-password-form";
import { ProntoclinicaLogo } from "@/components/logo";

export const metadata = { title: "Redefinir senha — Pronto Satisfação" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="rounded-2xl bg-background shadow-neumorphic p-8 w-full">
      <div className="text-center mb-6 flex flex-col items-center">
        <ProntoclinicaLogo className="justify-center" />
        <h1 className="text-lg font-bold mt-4 text-[#3A3333]">Redefinir senha</h1>
        <p className="text-[#6E6565] text-sm mt-1">Escolha uma nova senha</p>
      </div>
      <div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-[#901A1E] text-center text-sm font-medium p-4 bg-background shadow-neumorphic-inset rounded-2xl">
            Link inválido (token ausente).
          </p>
        )}
      </div>
    </div>
  );
}
