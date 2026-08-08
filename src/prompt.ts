import { config } from "./config.js";
import type { ChatMessage } from "./ollama.js";
import type { Correspondent, DocumentType, Tag } from "./types.js";

const SYSTEM_PROMPT = `You are a document-classification assistant for a document management system (Paperless-ngx).
Given the OCR text of a scanned document, you determine its title, document type, correspondent, and tags.

You MUST respond with strict JSON matching exactly this shape, and nothing else (no markdown, no explanation):
{
  "title": "string, concise, descriptive",
  "document_type": "string, existing or new",
  "correspondent": "string, existing or new",
  "tags": ["string", "..."]
}

Rules:
- Prefer reusing an existing tag/correspondent/document type from the candidate lists provided, when one fits well.
- Only propose a new tag/correspondent/document type when nothing in the candidate list is a good fit. Propose new ones sparingly.
- Tags should be 1-5 relevant keywords, each short (1-3 words).
- The title must be specific to this document's content, not a restatement of the document type (e.g. not just "Invoice").
- correspondent is the sender/issuer of the document (a company, institution, or person), not the recipient.`;

function cleanOcrText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= config.OCR_TEXT_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, config.OCR_TEXT_MAX_CHARS)}… [truncated]`;
}

function formatNames(items: { name: string }[]): string {
  if (items.length === 0) return "(none)";
  return items.map((i) => `- ${i.name}`).join("\n");
}

export function buildClassificationMessages(params: {
  ocrText: string;
  candidateTags: Tag[];
  candidateCorrespondents: Correspondent[];
  allDocumentTypes: DocumentType[];
}): ChatMessage[] {
  const { ocrText, candidateTags, candidateCorrespondents, allDocumentTypes } =
    params;

  const userContent = `## Document OCR text
${cleanOcrText(ocrText)}

## Candidate tags (prefer reusing one of these; propose new only if none fit)
${formatNames(candidateTags)}

## Candidate correspondents (prefer reusing one of these; propose new only if none fit)
${formatNames(candidateCorrespondents)}

## Existing document types (prefer reusing one of these; propose new only if none fit)
${formatNames(allDocumentTypes)}

Respond with the JSON object described in the system prompt.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

export function buildRetryMessages(
  previous: ChatMessage[],
  invalidResponse: string,
  errorMessage: string,
): ChatMessage[] {
  return [
    ...previous,
    { role: "assistant", content: invalidResponse },
    {
      role: "user",
      content: `Your last response was invalid JSON because: ${errorMessage}\nRespond again with ONLY the corrected strict JSON object, matching the required shape exactly.`,
    },
  ];
}
