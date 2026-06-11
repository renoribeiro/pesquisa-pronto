"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getOrCreateLinkDistribution, dispatchSurveyByEmail } from "@/modules/channels/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface DistributionPanelProps {
  surveyId: string;
  surveySlug: string;
}

export function DistributionPanel({ surveyId, surveySlug }: DistributionPanelProps) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const surveyUrl = `${baseUrl}/p/${surveySlug}`;

  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();

  function copyLink() {
    navigator.clipboard.writeText(surveyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function activateLink() {
    start(async () => {
      try {
        await getOrCreateLinkDistribution(surveyId);
        toast.success("Canal de link ativado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao ativar canal.");
      }
    });
  }

  return (
    <Tabs defaultValue="link">
      <TabsList>
        <TabsTrigger value="link">Link direto</TabsTrigger>
        <TabsTrigger value="qr">QR Code</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
      </TabsList>

      <TabsContent value="link">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Link direto
              <Badge variant="secondary">LINK</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL pública da pesquisa</Label>
              <div className="flex gap-2">
                <Input value={surveyUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" onClick={copyLink}>
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={activateLink}>
              Registrar canal de link
            </Button>
            <p className="text-xs text-muted-foreground">
              Compartilhe este link para coletar respostas anônimas.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="qr">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QrCodeDisplay url={surveyUrl} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="email">
        <EmailDispatchForm surveyId={surveyId} baseUrl={baseUrl} />
      </TabsContent>
    </Tabs>
  );
}

function QrCodeDisplay({ url }: { url: string }) {
  // Inline QR generation using Google Charts API (no extra dep)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrUrl}
        alt="QR Code para a pesquisa"
        width={200}
        height={200}
        className="rounded-lg border"
      />
      <p className="text-xs text-muted-foreground break-all">{url}</p>
      <Button
        variant="outline"
        size="sm"
        render={<a href={qrUrl} download="qrcode-pesquisa.png" target="_blank" rel="noreferrer" />}
      >
        Baixar QR Code
      </Button>
    </div>
  );
}

function EmailDispatchForm({ surveyId, baseUrl }: { surveyId: string; baseUrl: string }) {
  const [subject, setSubject] = useState("Pesquisa de satisfação — Prontoclínica");
  const [recipientsText, setRecipientsText] = useState("");
  const [pending, start] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const lines = recipientsText.split("\n").filter((l) => l.trim());
    const recipients = lines.map((l) => {
      const [name, email] = l.split(",").map((s) => s.trim());
      return email ? { name, email } : { email: name };
    });

    if (recipients.length === 0) {
      toast.error("Adicione pelo menos um destinatário.");
      return;
    }

    start(async () => {
      try {
        const result = await dispatchSurveyByEmail({
          surveyId,
          subject,
          recipients,
          baseUrl,
        });
        toast.success(`${result.sent} email(s) enviado(s) com sucesso.`);
        setRecipientsText("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar emails.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Disparar por email</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto do email</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipients">
              Destinatários{" "}
              <span className="text-xs text-muted-foreground">(um por linha: Nome, email)</span>
            </Label>
            <textarea
              id="recipients"
              className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={"João Silva, joao@email.com\nMaria Santos, maria@email.com"}
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Enviando..." : "Enviar emails"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
