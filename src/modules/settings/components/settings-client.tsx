"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateClinic,
  updatePrivacy,
  createSector,
  toggleSector,
  createTouchPoint,
  toggleTouchPoint,
} from "@/modules/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Clinic {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  timezone: string;
  privacyPolicy: string | null;
  retentionMonths: number;
  logoUrl: string | null;
}
interface Item {
  id: string;
  name: string;
  active: boolean;
  icon?: string | null;
}

export function SettingsClient({
  clinic,
  sectors,
  touchPoints,
}: {
  clinic: Clinic;
  sectors: Item[];
  touchPoints: Item[];
}) {
  const [pending, start] = useTransition();

  function onClinicSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    start(async () => {
      try {
        await updateClinic(payload);
        toast.success("Configurações salvas.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  function onPrivacySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    start(async () => {
      try {
        await updatePrivacy(payload);
        toast.success("Configurações salvas.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">Geral</TabsTrigger>
        <TabsTrigger value="sectors">Setores</TabsTrigger>
        <TabsTrigger value="touchpoints">Pontos de Contato</TabsTrigger>
        <TabsTrigger value="privacy">LGPD</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <Card>
          <CardHeader>
            <CardTitle>Dados da clínica</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onClinicSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" defaultValue={clinic.name} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Email de contato</Label>
                  <Input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    defaultValue={clinic.contactEmail ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Telefone</Label>
                  <Input
                    id="contactPhone"
                    name="contactPhone"
                    defaultValue={clinic.contactPhone ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" defaultValue={clinic.address ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Fuso horário</Label>
                <Input id="timezone" name="timezone" defaultValue={clinic.timezone} />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sectors">
        <ItemManager
          title="Setores / Especialidades"
          items={sectors}
          onCreate={(name) => createSector({ name })}
          onToggle={(id, active) => toggleSector(id, active)}
        />
      </TabsContent>

      <TabsContent value="touchpoints">
        <ItemManager
          title="Pontos de Contato"
          items={touchPoints}
          withIcon
          onCreate={(name, icon) => createTouchPoint({ name, icon })}
          onToggle={(id, active) => toggleTouchPoint(id, active)}
        />
      </TabsContent>

      <TabsContent value="privacy">
        <Card>
          <CardHeader>
            <CardTitle>Privacidade e LGPD</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onPrivacySubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retentionMonths">Retenção de dados (meses)</Label>
                <Input
                  id="retentionMonths"
                  name="retentionMonths"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={clinic.retentionMonths}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="privacyPolicy">
                  Texto de política de privacidade (exibido nos formulários)
                </Label>
                <Textarea
                  id="privacyPolicy"
                  name="privacyPolicy"
                  rows={6}
                  defaultValue={clinic.privacyPolicy ?? ""}
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function ItemManager({
  title,
  items,
  withIcon,
  onCreate,
  onToggle,
}: {
  title: string;
  items: Item[];
  withIcon?: boolean;
  onCreate: (name: string, icon?: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            start(async () => {
              try {
                await onCreate(name.trim(), icon.trim() || undefined);
                setName("");
                setIcon("");
                toast.success("Adicionado.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erro.");
              }
            });
          }}
        >
          {withIcon ? (
            <Input
              className="w-16"
              placeholder="🏥"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          ) : null}
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={pending}>
            Adicionar
          </Button>
        </form>
        <ul className="divide-y rounded-md border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm">
                {it.icon ? `${it.icon} ` : ""}
                {it.name}
              </span>
              <Switch
                checked={it.active}
                onCheckedChange={(v) =>
                  start(async () => {
                    await onToggle(it.id, v);
                  })
                }
              />
            </li>
          ))}
          {items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-sm">Nenhum item.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
