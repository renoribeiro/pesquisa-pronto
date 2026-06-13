import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) {
    return new Array(1536).fill(0);
  }
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export type SentimentResult = {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  intensity: number; // 0-100
  emotions: string[];
  summary: string;
};

export async function analyzeSentiment(textAnswers: string[]): Promise<SentimentResult> {
  if (textAnswers.length === 0) {
    return { sentiment: "NEUTRAL", intensity: 50, emotions: [], summary: "" };
  }

  const client = getAnthropicClient();
  const combinedText = textAnswers.join("\n\n---\n\n");

  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Analise o sentimento das seguintes respostas de pesquisa de satisfação de clínica médica.

RESPOSTAS:
${combinedText}

Retorne APENAS um JSON com esta estrutura (sem markdown, sem explicações):
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "intensity": <número 0-100>,
  "emotions": ["emoção1", "emoção2"],
  "summary": "<resumo em 1-2 frases em português>"
}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const parsed = JSON.parse(raw.trim()) as Partial<SentimentResult>;
    return {
      sentiment: parsed.sentiment ?? "NEUTRAL",
      intensity: parsed.intensity ?? 50,
      emotions: parsed.emotions ?? [],
      summary: parsed.summary ?? "",
    };
  } catch {
    return { sentiment: "NEUTRAL", intensity: 50, emotions: [], summary: raw.slice(0, 200) };
  }
}

export async function generateExecutiveSummary(
  surveyTitle: string,
  npsScore: number,
  totalResponses: number,
  topEmotions: string[],
  recentComments: string[],
): Promise<string> {
  const client = getAnthropicClient();

  const prompt = `Gere um resumo executivo conciso (3-4 parágrafos) em português para a pesquisa de satisfação "${surveyTitle}" da Prontoclínica de Fortaleza.

Dados:
- NPS: ${npsScore}
- Total de respostas: ${totalResponses}
- Principais emoções detectadas: ${topEmotions.join(", ") || "N/A"}
- Comentários recentes selecionados:
${recentComments.slice(0, 5).join("\n\n")}

O resumo deve incluir: principais achados, pontos de atenção, tendências e sugestões de melhoria. Use linguagem executiva e objetiva.`;

  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
