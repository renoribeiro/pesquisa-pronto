"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { parseRecipientsFile, dispatchSurveyBatch } from "@/modules/channels/batch-actions";
import type { ParsedRecipients } from "@/lib/recipients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Channel = "EMAIL" | "WHATSAPP" | "SMS";
type Field = "name" | "email" | "phone" | "sector";

const NONE = "__none__";

const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
};

/** Campo obrigatório por canal: define qual mapeamento valida o destinatário. */
const REQUIRED_FIELD: Record<Channel, Extract<Field, "email" | "phone">> = {
  EMAIL: "email",
  WHATSAPP: "phone",
  SMS: "phone",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 8;
}

/** Tenta adivinhar a coluna de cada campo a partir do nome do cabeçalho. */
function guessMapping(headers: string[]): Record<Field, number | null> {
  const patterns: Record<Field, RegExp> = {
    name: /nome|name|paciente|cliente|contato/i,
    email: /mail|e-?mail/i,
    phone: /fone|phone|celular|whats|telefone|tel\b/i,
    sector: /setor|sector|especialidade|departamento|área|area/i,
  };
  const result: Record<Field, number | null> = { name: null, email: null, phone: null, sector: null };
  (Object.keys(patterns) as Field[]).forEach((field) => {
    const idx = headers.findIndex((h) => patterns[field].test(h));
    result[field] = idx >= 0 ? idx : null;
  });
  return result;
}

export function BatchDispatchForm({ surveyId }: { surveyId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null);
  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [subject, setSubject] = useState("Pesquisa de satisfação — Prontoclínica");
  const [mapping, setMapping] = useState<Record<Field, number | null>>({
    name: null,
    email: null,
    phone: null,
    sector: null,
  });
  const [scheduledAt, setScheduledAt] = useState("");
  const [parsing, startParse] = useTransition();
  const [sending, startSend] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    startParse(async () => {
      try {
        const result = await parseRecipientsFile(formData);
        setParsed(result);
        setMapping(guessMapping(result.headers));
        toast.success(`${result.totalRows} linha(s) lida(s).`);
      } catch (err) {
        setParsed(null);
        toast.error(err instanceof Error ? err.message : "Erro ao ler o arquivo.");
      }
    });
  }

  const requiredField = REQUIRED_FIELD[channel];
  const requiredMapped = mapping[requiredField] !== null;

  /** Destinatários derivados do mapeamento, com flag de validade por canal. */
  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      const get = (f: Field) => (mapping[f] !== null ? (row[mapping[f] as number] ?? "").trim() : "");
      const name = get("name");
      const email = get("email");
      const phone = get("phone");
      const sector = get("sector");
      const valid =
        requiredField === "email" ? isValidEmail(email) : isValidPhone(phone);
      return { name, email, phone, sector, valid };
    });
  }, [parsed, mapping, requiredField]);

  const stats = useMemo(() => {
    const valid = previewRows.filter((r) => r.valid).length;
    return { valid, invalid: previewRows.length - valid, total: previewRows.length };
  }, [previewRows]);

  function reset() {
    setParsed(null);
    setFileName("");
    setScheduledAt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    if (!parsed) return;
    if (!requiredMapped) {
      toast.error(`Mapeie a coluna de ${requiredField === "email" ? "e-mail" : "telefone"}.`);
      return;
    }
    if (channel === "EMAIL" && !subject.trim()) {
      toast.error("Informe o assunto do e-mail.");
      return;
    }
    if (stats.valid === 0) {
      toast.error("Nenhum destinatário válido para o canal selecionado.");
      return;
    }

    const recipients = previewRows
      .filter((r) => r.valid)
      .map((r) => ({
        name: r.name || undefined,
        email: channel === "EMAIL" ? r.email : undefined,
        phone: channel !== "EMAIL" ? r.phone : undefined,
        sector: r.sector || undefined,
      }));

    let scheduledIso: string | null = null;
    if (scheduledAt) {
      const d = new Date(scheduledAt);
      if (Number.isNaN(d.getTime())) {
        toast.error("Data de agendamento inválida.");
        return;
      }
      scheduledIso = d.toISOString();
    }

    startSend(async () => {
      try {
        const result = await dispatchSurveyBatch({
          surveyId,
          channel,
          subject: channel === "EMAIL" ? subject : undefined,
          scheduledAt: scheduledIso,
          recipients,
        });
        const when = result.scheduledAt
          ? ` agendado(s) para ${new Date(result.scheduledAt).toLocaleString("pt-BR")}`
          : "";
        toast.success(`${result.enqueued} disparo(s) na fila${when}.`);
        if (result.failures.length > 0) {
          toast.warning(`${result.failures.length} destinatário(s) ignorado(s) por erro.`);
        }
        reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar o lote.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Canal + arquivo */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Canal de disparo</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="batch-file">Arquivo (CSV ou Excel)</Label>
          <Input
            id="batch-file"
            type="file"
            ref={fileInputRef}
            accept=".csv,.txt,.xlsx,.xls"
            onChange={handleFile}
            disabled={parsing}
          />
        </div>
      </div>

      {channel === "EMAIL" && (
        <div className="space-y-2">
          <Label htmlFor="batch-subject">Assunto do e-mail</Label>
          <Input
            id="batch-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      )}

      {parsing && <p className="text-sm text-muted-foreground">Lendo arquivo…</p>}

      {parsed && (
        <>
          {/* Mapeamento de colunas */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Mapeamento de colunas{" "}
              <span className="text-xs font-normal text-muted-foreground">({fileName})</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["name", "email", "phone", "sector"] as Field[]).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs">
                    {field === "name"
                      ? "Nome"
                      : field === "email"
                        ? "E-mail"
                        : field === "phone"
                          ? "Telefone"
                          : "Setor"}
                    {field === requiredField && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field] === null ? NONE : String(mapping[field])}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [field]: v === NONE ? null : Number(v) }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— nenhuma —</SelectItem>
                      {parsed.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo de validação */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{stats.total} no arquivo</Badge>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              {stats.valid} válido(s)
            </Badge>
            {stats.invalid > 0 && <Badge variant="destructive">{stats.invalid} sem dado válido</Badge>}
            {!requiredMapped && (
              <span className="text-xs text-destructive">
                Mapeie a coluna de {requiredField === "email" ? "e-mail" : "telefone"} (obrigatória).
              </span>
            )}
          </div>

          {/* Preview (primeiras linhas) */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>{requiredField === "email" ? "E-mail" : "Telefone"}</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.slice(0, 8).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(requiredField === "email" ? r.email : r.phone) || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{r.sector || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {r.valid ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">ok</Badge>
                      ) : (
                        <Badge variant="destructive">inválido</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {previewRows.length > 8 && (
              <p className="border-t p-2 text-center text-xs text-muted-foreground">
                + {previewRows.length - 8} linha(s) não exibida(s)
              </p>
            )}
          </div>

          {/* Agendamento + envio */}
          <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <Label htmlFor="batch-schedule" className="text-xs">
                Agendar envio (opcional)
              </Label>
              <Input
                id="batch-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full sm:w-auto"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={sending}>
                Limpar
              </Button>
              <Button onClick={submit} disabled={sending || !requiredMapped || stats.valid === 0}>
                {sending
                  ? "Enviando…"
                  : scheduledAt
                    ? `Agendar ${stats.valid} disparo(s)`
                    : `Disparar ${stats.valid}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
