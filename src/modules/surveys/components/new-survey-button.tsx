"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSurvey } from "@/modules/surveys/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewSurveyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!title.trim()) return;
    start(async () => {
      try {
        const id = await createSurvey(title.trim());
        toast.success("Pesquisa criada.");
        router.push(`/admin/surveys/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nova pesquisa</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pesquisa</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Satisfação Pós-Consulta"
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Criando..." : "Criar e editar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
