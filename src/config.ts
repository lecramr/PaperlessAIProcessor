import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .string()
  .default("false")
  .transform((v) => v.toLowerCase() === "true");

const ConfigSchema = z.object({
  PAPERLESS_BASE_URL: z.string().url(),
  PAPERLESS_API_TOKEN: z.string().min(1),

  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1),
  OLLAMA_EMBED_MODEL: z.string().min(1),

  TAG_FILTER: z
    .string()
    .min(1)
    .default("to-ai")
    .transform((v) =>
      v
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string())
        .min(1, "TAG_FILTER must contain at least one tag name"),
    ),
  PROCESSED_TAG: z.string().min(1).default("ai-processed"),
  CANDIDATE_LIMIT: z.coerce.number().int().positive().default(50),
  EMBEDDING_STRATEGY: z.enum(["embedding", "lexical"]).default("embedding"),
  DRY_RUN: boolFromString,
  AUTO_MODE: boolFromString,

  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  PAPERLESS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  OCR_TEXT_MAX_CHARS: z.coerce.number().int().positive().default(6000),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid/missing environment variables:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
