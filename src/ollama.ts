import { config } from "./config.js";
import { OllamaChatResponseSchema, OllamaEmbeddingResponseSchema } from "./types.js";

const BASE = config.OLLAMA_BASE_URL.replace(/\/+$/, "");

async function ollamaFetch(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama API POST ${path} failed: ${res.status} ${res.statusText} ${text}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function embed(text: string): Promise<number[]> {
  const res = await ollamaFetch("/api/embeddings", {
    model: config.OLLAMA_EMBED_MODEL,
    prompt: text,
  });
  const json = await res.json();
  return OllamaEmbeddingResponseSchema.parse(json).embedding;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatJson(messages: ChatMessage[]): Promise<string> {
  const res = await ollamaFetch("/api/chat", {
    model: config.OLLAMA_MODEL,
    messages,
    format: "json",
    stream: false,
  });
  const json = await res.json();
  return OllamaChatResponseSchema.parse(json).message.content;
}
