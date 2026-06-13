import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/components/forgot-password-form";
import { ProntoclinicaLogo } from "@/components/logo";

export const metadata = { title: "Recuperar senha — Pronto Satisfação" };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-2xl bg-background shadow-neumorphic p-8 w-full">
      <div className="text-center mb-6 flex flex-col items-center">
        <ProntoclinicaLogo className="justify-center" />
        <h1 className="text-lg font-bold mt-4 text-[#3A3333]">Recuperar senha</h1>
        <p className="text-[#6E6565] text-sm mt-1">Enviaremos um link para o seu email</p>
      </div>
      <div>
        <ForgotPasswordForm />
        <p className="mt-6 text-center">
          <Link 
            href="/login" 
            className="text-[#901A1E] hover:text-[#a12428] text-sm font-medium transition-colors hover:underline underline-offset-4"
          >
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
