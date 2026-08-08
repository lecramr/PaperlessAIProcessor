import { config } from "./config.js";
import { embed } from "./ollama.js";
import type { EmbeddedItem } from "./types.js";

interface NamedItem {
  id: number;
  name: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedCandidates<T extends NamedItem>(
  items: T[],
): Promise<EmbeddedItem<T>[]> {
  const embedded: EmbeddedItem<T>[] = [];
  for (const item of items) {
    const embedding = await embed(item.name);
    embedded.push({ item, embedding });
  }
  return embedded;
}

function shortlistByEmbedding<T extends NamedItem>(
  docEmbedding: number[],
  embeddedItems: EmbeddedItem<T>[],
  limit: number,
): T[] {
  return embeddedItems
    .map((e) => ({
      item: e.item,
      score: cosineSimilarity(docEmbedding, e.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.item);
}

function shortlistByLexical<T extends NamedItem>(
  docText: string,
  items: T[],
  limit: number,
): T[] {
  const haystack = docText.toLowerCase();
  return items
    .map((item) => {
      const tokens = item.name.toLowerCase().split(/\s+/).filter(Boolean);
      const score = tokens.reduce(
        (acc, t) => acc + (haystack.includes(t) ? 1 : 0),
        0,
      );
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.item);
}

export interface ShortlistInput<T extends NamedItem> {
  docText: string;
  docEmbedding: number[] | null;
  embeddedItems: EmbeddedItem<T>[] | null;
  plainItems: T[];
  limit?: number;
}

export function shortlistCandidates<T extends NamedItem>({
  docText,
  docEmbedding,
  embeddedItems,
  plainItems,
  limit = config.CANDIDATE_LIMIT,
}: ShortlistInput<T>): T[] {
  if (
    config.EMBEDDING_STRATEGY === "embedding" &&
    docEmbedding &&
    embeddedItems
  ) {
    return shortlistByEmbedding(docEmbedding, embeddedItems, limit);
  }
  return shortlistByLexical(docText, plainItems, limit);
}
