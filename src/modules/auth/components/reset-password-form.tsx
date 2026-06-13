"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = (e.currentTarget.elements.namedItem("password") as HTMLInputElement).value;
    const res = await resetPassword({ token, password });
    setPending(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError(res.message);
    }
  }

  if (done) {
    return (
      <p className="text-[#6E6565] text-center text-sm font-medium p-4 bg-background shadow-neumorphic-inset rounded-2xl">
        Senha redefinida! Redirecionando para o login...
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[#3A3333] font-medium text-sm ml-1">
          Nova senha
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl h-11 px-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] md:text-sm"
        />
      </div>
      {error ? <p className="text-[#901A1E] text-sm font-medium ml-1">{error}</p> : null}
      <Button 
        type="submit" 
        className="w-full bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 transition-all duration-300 font-bold active:translate-y-[0.5px] disabled:opacity-50 disabled:pointer-events-none mt-2 focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6]"
        disabled={pending}
      >
        {pending ? "Salvando..." : "Redefinir senha"}
      </Button>

      {/* SSL Trust Indicator */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-[#6E6565]/80 font-semibold mt-4">
        <svg className="h-3.5 w-3.5 text-[#C5A059]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Conexão criptografada SSL segura</span>
      </div>
    </form>
  );
}
