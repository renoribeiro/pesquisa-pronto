import Link from "next/link";
import { LoginForm } from "@/modules/auth/components/login-form";
import { ProntoclinicaLogo } from "@/components/logo";

export const metadata = { title: "Entrar — Pronto Satisfação" };

export default function LoginPage() {
  return (
    <div className="rounded-2xl bg-background shadow-neumorphic p-8 w-full">
      <div className="text-center mb-6 flex flex-col items-center">
        <ProntoclinicaLogo className="justify-center" />
        <h1 className="text-lg font-bold mt-4 text-[#3A3333]">Pronto Satisfação</h1>
        <p className="text-[#6E6565] text-sm mt-1">Acesse o painel da clínica</p>
      </div>
      <div>
        <LoginForm />
        <p className="mt-6 text-center">
          <Link 
            href="/forgot-password" 
            className="text-[#901A1E] hover:text-[#a12428] text-sm font-medium transition-colors hover:underline underline-offset-4"
          >
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  );
}
