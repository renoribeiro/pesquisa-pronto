"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getOrCreateLinkDistribution,
  getOrCreateEmbedDistribution,
  dispatchSurveyByEmail,
} from "@/modules/channels/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BatchDispatchForm } from "@/modules/channels/components/batch-dispatch-form";

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
        <TabsTrigger value="batch">Lote (CSV/Excel)</TabsTrigger>
        <TabsTrigger value="embed">Embed</TabsTrigger>
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
        <EmailDispatchForm surveyId={surveyId} />
      </TabsContent>

      <TabsContent value="batch">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disparo em lote</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchDispatchForm surveyId={surveyId} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="embed">
        <EmbedPanel surveyId={surveyId} surveySlug={surveySlug} baseUrl={baseUrl} />
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

function CopyableSnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copiado!" : "Copiar código"}
      </Button>
    </div>
  );
}

function EmbedPanel({
  surveyId,
  surveySlug,
  baseUrl,
}: {
  surveyId: string;
  surveySlug: string;
  baseUrl: string;
}) {
  const [, start] = useTransition();

  const inlineSnippet = `<iframe src="${baseUrl}/embed/${surveySlug}"\n  style="border:0;width:100%;max-width:640px;height:600px"\n  title="Pesquisa de satisfação" loading="lazy"></iframe>`;
  const popupSnippet = `<script src="${baseUrl}/embed.js"\n  data-survey="${surveySlug}"\n  data-mode="popup"\n  data-label="Avalie-nos"\n  data-color="#901A1E" defer></script>`;

  function activateEmbed() {
    start(async () => {
      try {
        await getOrCreateEmbedDistribution(surveyId);
        toast.success("Canal de embed registrado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao registrar canal.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Incorporar (embed)
          <Badge variant="secondary">EMBED</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Inline (iframe na página)</Label>
          <p className="text-xs text-muted-foreground">
            Cole onde o formulário deve aparecer dentro da sua página.
          </p>
          <CopyableSnippet code={inlineSnippet} />
        </div>

        <div className="space-y-2">
          <Label>Popup flutuante (botão no canto)</Label>
          <p className="text-xs text-muted-foreground">
            Cole antes de <code className="font-mono">&lt;/body&gt;</code>. Mostra um botão flutuante
            que abre o formulário em um modal.
          </p>
          <CopyableSnippet code={popupSnippet} />
        </div>

        <Button variant="outline" size="sm" onClick={activateEmbed}>
          Registrar canal de embed
        </Button>
      </CardContent>
    </Card>
  );
}

/** Validação leve de e-mail no cliente (espelha z.string().email() do servidor). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function EmailDispatchForm({ surveyId }: { surveyId: string }) {
  const [subject, setSubject] = useState("Pesquisa de satisfação — Prontoclínica");
  const [recipientsText, setRecipientsText] = useState("");
  const [pending, start] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const lines = recipientsText.split("\n").map((l) => l.trim()).filter(Boolean);
    const recipients: { name?: string; email: string }[] = [];
    const invalid: string[] = [];

    for (const line of lines) {
      // Formato esperado: "Nome, email" ou apenas "email".
      const parts = line.split(",").map((s) => s.trim());
      let name: string | undefined;
      let email: string;
      if (parts.length >= 2) {
        // Há vírgula: a última parte é o e-mail; o restante compõe o nome.
        email = parts[parts.length - 1];
        name = parts.slice(0, -1).join(", ").trim() || undefined;
      } else {
        // Sem vírgula: a linha inteira deve ser um e-mail (não há nome).
        email = parts[0];
      }

      if (!isValidEmail(email)) {
        invalid.push(line);
        continue;
      }
      recipients.push({ name, email });
    }

    if (invalid.length > 0) {
      toast.error(
        `${invalid.length} linha(s) sem e-mail válido foram ignoradas: ${invalid
          .slice(0, 3)
          .join("; ")}${invalid.length > 3 ? "…" : ""}`,
      );
    }

    if (recipients.length === 0) {
      toast.error("Adicione pelo menos um destinatário com e-mail válido.");
      return;
    }

    start(async () => {
      try {
        const result = await dispatchSurveyByEmail({
          surveyId,
          subject,
          recipients,
        });
        toast.success(`${result.sent} email(s) enfileirado(s) para envio.`);
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
