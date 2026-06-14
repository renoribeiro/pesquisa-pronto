import { describe, it, expect } from "vitest";
import {
  parseCsv,
  normalizeMatrix,
  parseRecipientsBuffer,
  isValidEmail,
  normalizePhone,
  MAX_ROWS,
} from "@/lib/recipients";

/** Testes PUROS dos helpers de parsing/validação de destinatários (sem I/O/auth). */

describe("isValidEmail", () => {
  it("aceita e-mails válidos e rejeita inválidos", () => {
    expect(isValidEmail("joao@email.com")).toBe(true);
    expect(isValidEmail("  joao@email.com  ")).toBe(true);
    expect(isValidEmail("sem-arroba")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("extrai dígitos e preserva o + internacional", () => {
    expect(normalizePhone("(85) 99622-7722")).toBe("85996227722");
    expect(normalizePhone("+55 85 99622-7722")).toBe("+5585996227722");
  });
  it("rejeita telefones curtos demais", () => {
    expect(normalizePhone("123")).toBe("");
    expect(normalizePhone("")).toBe("");
  });
});

describe("parseCsv", () => {
  it("separa por vírgula respeitando aspas duplas", () => {
    const rows = parseCsv('nome,email\n"Silva, João",joao@x.com');
    expect(rows).toEqual([
      ["nome", "email"],
      ["Silva, João", "joao@x.com"],
    ]);
  });

  it("detecta delimitador ponto-e-vírgula (export BR)", () => {
    const rows = parseCsv("nome;email\nMaria;maria@x.com");
    expect(rows).toEqual([
      ["nome", "email"],
      ["Maria", "maria@x.com"],
    ]);
  });

  it("trata aspas duplas escapadas e remove BOM e linhas vazias", () => {
    const rows = parseCsv('﻿a,b\n"diz ""oi""",2\n\n');
    expect(rows).toEqual([
      ["a", "b"],
      ['diz "oi"', "2"],
    ]);
  });

  it("lida com CRLF e ausência de newline final", () => {
    const rows = parseCsv("a,b\r\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("detecta ';' mesmo com vírgula dentro de aspas no cabeçalho", () => {
    const rows = parseCsv('"Nome, Completo";Email\n"Silva, João";joao@x.com');
    expect(rows).toEqual([
      ["Nome, Completo", "Email"],
      ["Silva, João", "joao@x.com"],
    ]);
  });
});

describe("normalizeMatrix", () => {
  it("normaliza largura das linhas ao cabeçalho", () => {
    const { headers, rows, totalRows } = normalizeMatrix([
      ["nome", "email", "setor"],
      ["João", "joao@x.com"], // faltando coluna -> preenche vazio
      ["Maria", "maria@x.com", "Cardio", "extra"], // sobra -> trunca
    ]);
    expect(headers).toEqual(["nome", "email", "setor"]);
    expect(rows).toEqual([
      ["João", "joao@x.com", ""],
      ["Maria", "maria@x.com", "Cardio"],
    ]);
    expect(totalRows).toBe(2);
  });

  it("nomeia colunas de cabeçalho vazias", () => {
    const { headers } = normalizeMatrix([["nome", ""], ["a", "b"]]);
    expect(headers).toEqual(["nome", "Coluna 2"]);
  });

  it("lança quando há apenas cabeçalho", () => {
    expect(() => normalizeMatrix([["nome", "email"]])).toThrow(/só tem cabeçalho/);
  });

  it("lança quando excede o limite de linhas", () => {
    const big = [["email"], ...Array.from({ length: MAX_ROWS + 1 }, () => ["x@y.com"])];
    expect(() => normalizeMatrix(big)).toThrow(/Limite/);
  });
});

describe("parseRecipientsBuffer", () => {
  it("lê CSV de um buffer", async () => {
    const buf = Buffer.from("nome,email\nJoão,joao@x.com", "utf-8");
    const result = await parseRecipientsBuffer(buf, "csv");
    expect(result.headers).toEqual(["nome", "email"]);
    expect(result.rows).toEqual([["João", "joao@x.com"]]);
  });

  it("rejeita extensão não suportada", async () => {
    await expect(parseRecipientsBuffer(Buffer.from("x"), "pdf")).rejects.toThrow(/Formato inválido/);
  });
});
