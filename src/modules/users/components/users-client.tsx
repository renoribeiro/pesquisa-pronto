"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inviteUser, toggleUser } from "@/modules/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLES = [
  { value: "CLINIC_ADMIN", label: "Admin da Clínica" },
  { value: "SECTOR_MANAGER", label: "Gestor de Setor" },
  { value: "OPERATOR", label: "Operador" },
  { value: "VIEWER", label: "Visualizador" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export function UsersClient({
  users,
  canSuperAdmin,
}: {
  users: UserRow[];
  canSuperAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "VIEWER" });

  const roleOptions = canSuperAdmin ? ROLES : ROLES.filter((r) => r.value !== "SUPER_ADMIN");

  function submitInvite() {
    if (!form.name || !form.email) {
      toast.error("Preencha nome e email.");
      return;
    }
    start(async () => {
      try {
        await inviteUser(form);
        toast.success("Convite enviado.");
        setOpen(false);
        setForm({ name: "", email: "", role: "VIEWER" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao convidar.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>Convidar usuário</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="iname">Nome</Label>
                <Input
                  id="iname"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iemail">Email</Label>
                <Input
                  id="iemail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: (v as string) ?? "VIEWER" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submitInvite} disabled={pending}>
                {pending ? "Enviando..." : "Enviar convite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead className="text-right">Ativo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={u.active}
                  onCheckedChange={(v) =>
                    start(async () => {
                      try {
                        await toggleUser(u.id, v);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Erro.");
                      }
                    })
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
