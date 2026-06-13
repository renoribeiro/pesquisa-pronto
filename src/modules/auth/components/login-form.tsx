"use client";

import { useActionState } from "react";
import { authenticate, type LoginState } from "@/modules/auth/login-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(authenticate, {});

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[#3A3333] font-medium text-sm ml-1">
          Email
        </Label>
        <Input 
          id="email" 
          name="email" 
          type="email" 
          autoComplete="email" 
          required 
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl h-11 px-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] md:text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[#3A3333] font-medium text-sm ml-1">
          Senha
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl h-11 px-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#A0AEC0] md:text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="totp" className="text-[#3A3333] font-medium text-sm ml-1">
          Código 2FA (se habilitado)
        </Label>
        <Input
          id="totp"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          className="bg-background border-0 shadow-neumorphic-inset rounded-2xl h-11 px-4 text-base focus-visible:shadow-neumorphic-inset-deep focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6] focus-visible:outline-none transition-all duration-300 text-[#3A3333] placeholder:text-[#a8a0a0] md:text-sm"
        />
      </div>
      {state.error ? <p className="text-[#901A1E] text-sm font-semibold ml-1">{state.error}</p> : null}
      <Button 
        type="submit" 
        className="w-full bg-[#901A1E] hover:bg-[#a12428] text-white shadow-neumorphic hover:shadow-neumorphic-hover active:shadow-neumorphic-inset border-0 rounded-2xl h-11 transition-all duration-300 font-bold active:translate-y-[0.5px] disabled:opacity-50 disabled:pointer-events-none mt-2 focus-visible:ring-2 focus-visible:ring-[#901A1E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EBE6E6]"
        disabled={pending}
      >
        {pending ? "Entrando..." : "Entrar"}
      </Button>

      {/* SSL Trust Indicator */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-[#6E6565]/80 font-semibold mt-4">
        <svg className="h-3.5 w-3.5 text-[#C5A059]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Painel administrativo criptografado SSL</span>
      </div>
    </form>
  );
}
