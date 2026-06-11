"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value;
    const res = await requestPasswordReset({ email });
    setMessage(res.message);
    setPending(false);
  }

  if (message) {
    return <p className="text-muted-foreground text-center text-sm">{message}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}
