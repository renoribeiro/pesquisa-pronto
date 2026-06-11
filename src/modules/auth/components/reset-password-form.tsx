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
      <p className="text-muted-foreground text-center text-sm">
        Senha redefinida! Redirecionando para o login...
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando..." : "Redefinir senha"}
      </Button>
    </form>
  );
}
