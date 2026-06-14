/**
 * Helpers puros de parsing/validação de destinatários para disparo em lote
 * (CSV/Excel). Isolados de qualquer server action para serem testáveis e
 * reutilizáveis. O parsing de Excel usa `exceljs` (somente em runtime Node).
 */

export const MAX_ROWS = 10_000;

export type ParsedRecipients = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Normaliza telefone para dígitos (+ opcional no início). Vazio se inválido. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return hasPlus ? `+${digits}` : digits;
}

/** Coage qualquer célula (texto, número, data, rich text, hyperlink) em string. */
export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // ExcelJS: hyperlink -> { text, hyperlink }, fórmula -> { result },
    // rich text -> { richText: [{ text }] }.
    if (typeof v.text === "string") return v.text.trim();
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result).trim();
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((r) =>
          r && typeof (r as { text?: unknown }).text === "string" ? (r as { text: string }).text : "",
        )
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

/** Parser de CSV que respeita aspas duplas e detecta o delimitador (`,` ou `;`). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, ""); // remove BOM
  // Detecta delimitador na primeira linha não-vazia (exports BR costumam usar ';').
  // Conta FORA de aspas (remove trechos "..."), para que vírgulas dentro de um
  // campo entre aspas não enviesem a escolha do delimitador.
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const delimiter = unquoted.split(";").length > unquoted.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignorado; tratado junto de \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow((row) => {
    // row.values é 1-indexed (índice 0 vazio); fatiamos a partir de 1.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map((v) => cellToString(v));
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  });
  return rows;
}

/**
 * Normaliza uma matriz crua (linhas x colunas) em cabeçalho + linhas de mesma
 * largura, validando limites. Lança em arquivo vazio / só-cabeçalho / excesso.
 */
export function normalizeMatrix(matrix: string[][]): ParsedRecipients {
  if (matrix.length === 0) throw new Error("Arquivo vazio ou ilegível.");

  const [headerRow, ...dataRows] = matrix;
  const headers = headerRow.map((h, i) => h || `Coluna ${i + 1}`);

  if (dataRows.length === 0) throw new Error("O arquivo só tem cabeçalho, sem destinatários.");
  if (dataRows.length > MAX_ROWS) {
    throw new Error(
      `Limite de ${MAX_ROWS.toLocaleString("pt-BR")} destinatários por arquivo excedido.`,
    );
  }

  const width = headers.length;
  const rows = dataRows.map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });

  return { headers, rows, totalRows: rows.length };
}

/** Lê um buffer CSV/Excel em `{ headers, rows }`. `ext` em minúsculas, sem ponto. */
export async function parseRecipientsBuffer(buffer: Buffer, ext: string): Promise<ParsedRecipients> {
  let matrix: string[][];
  if (ext === "csv" || ext === "txt") {
    matrix = parseCsv(buffer.toString("utf-8"));
  } else if (ext === "xlsx" || ext === "xls") {
    matrix = await parseXlsx(buffer);
  } else {
    throw new Error("Formato inválido. Use CSV ou Excel (.xlsx).");
  }
  return normalizeMatrix(matrix);
}
