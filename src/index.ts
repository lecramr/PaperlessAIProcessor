import { createInterface } from "node:readline/promises";
import { config } from "./config.js";
import { embedCandidates, shortlistCandidates } from "./matching.js";
import { chatJson, embed, type ChatMessage } from "./ollama.js";
import {
  createCorrespondent,
  createDocumentType,
  createTag,
  fetchAllCorrespondents,
  fetchAllDocumentTypes,
  fetchAllTags,
  fetchDocumentDetail,
  fetchDocumentsByTagIds,
  patchDocument,
  resolveTagIdByName,
} from "./paperless.js";
import { buildClassificationMessages, buildRetryMessages } from "./prompt.js";
import {
  ClassificationResponseSchema,
  type ClassificationResponse,
  type Correspondent,
  type DocumentType,
  type EmbeddedItem,
  type PaperlessDocument,
  type Tag,
} from "./types.js";

interface Pools {
  tags: Tag[];
  correspondents: Correspondent[];
  documentTypes: DocumentType[];
  embeddedTags: EmbeddedItem<Tag>[] | null;
  embeddedCorrespondents: EmbeddedItem<Correspondent>[] | null;
}

interface Summary {
  processed: number;
  skippedByUser: number;
  failed: number;
}

function findByName<T extends { name: string }>(
  items: T[],
  name: string,
): T | undefined {
  const lower = name.trim().toLowerCase();
  return items.find((i) => i.name.trim().toLowerCase() === lower);
}

async function resolveTagId(name: string, pools: Pools): Promise<number> {
  const existing = findByName(pools.tags, name);
  if (existing) return existing.id;
  const created = await createTag(name);
  pools.tags.push(created);
  if (pools.embeddedTags) {
    pools.embeddedTags.push({
      item: created,
      embedding: await embed(created.name),
    });
  }
  return created.id;
}

async function resolveCorrespondentId(
  name: string,
  pools: Pools,
): Promise<number> {
  const existing = findByName(pools.correspondents, name);
  if (existing) return existing.id;
  const created = await createCorrespondent(name);
  pools.correspondents.push(created);
  if (pools.embeddedCorrespondents) {
    pools.embeddedCorrespondents.push({
      item: created,
      embedding: await embed(created.name),
    });
  }
  return created.id;
}

async function resolveDocumentTypeId(
  name: string,
  pools: Pools,
): Promise<number> {
  const existing = findByName(pools.documentTypes, name);
  if (existing) return existing.id;
  const created = await createDocumentType(name);
  pools.documentTypes.push(created);
  return created.id;
}

async function classifyDocument(
  doc: PaperlessDocument,
  pools: Pools,
): Promise<ClassificationResponse> {
  const docEmbedding =
    config.EMBEDDING_STRATEGY === "embedding"
      ? await embed(doc.content.slice(0, 4000))
      : null;

  const candidateTags = shortlistCandidates({
    docText: doc.content,
    docEmbedding,
    embeddedItems: pools.embeddedTags,
    plainItems: pools.tags,
  });
  const candidateCorrespondents = shortlistCandidates({
    docText: doc.content,
    docEmbedding,
    embeddedItems: pools.embeddedCorrespondents,
    plainItems: pools.correspondents,
  });

  const messages = buildClassificationMessages({
    ocrText: doc.content,
    candidateTags,
    candidateCorrespondents,
    allDocumentTypes: pools.documentTypes,
  });

  return await callClassifier(messages);
}

async function callClassifier(
  messages: ChatMessage[],
): Promise<ClassificationResponse> {
  const raw = await chatJson(messages);
  const attempt = tryParse(raw);
  if (attempt.ok) return attempt.value;

  const retryMessages = buildRetryMessages(messages, raw, attempt.error);
  const raw2 = await chatJson(retryMessages);
  const attempt2 = tryParse(raw2);
  if (attempt2.ok) return attempt2.value;

  throw new Error(
    `Ollama returned invalid classification JSON after retry: ${attempt2.error}`,
  );
}

type ParseResult =
  | { ok: true; value: ClassificationResponse }
  | { ok: false; error: string };

function tryParse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  const parsed = ClassificationResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, value: parsed.data };
}

async function confirmApply(
  doc: PaperlessDocument,
  classification: ClassificationResponse,
): Promise<boolean> {
  const preview = doc.content.slice(0, 500);
  console.log(
    `\n--- Document #${doc.id}: ${doc.original_file_name ?? doc.title} ---`,
  );
  console.log(preview.length < doc.content.length ? `${preview}…` : preview);
  console.log(`\nProposed title:         ${classification.title}`);
  console.log(`Proposed document type: ${classification.document_type}`);
  console.log(`Proposed correspondent: ${classification.correspondent}`);
  console.log(`Proposed tags:          ${classification.tags.join(", ")}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Apply these changes? (y/n) ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function processDocument(
  doc: PaperlessDocument,
  pools: Pools,
  processedTagId: number,
  toAiTagId: number,
  summary: Summary,
): Promise<void> {
  const full = await fetchDocumentDetail(doc.id);
  const classification = await classifyDocument(full, pools);

  if (!config.AUTO_MODE) {
    const apply = await confirmApply(full, classification);
    if (!apply) {
      console.log(`Skipped document #${full.id} (user declined).`);
      summary.skippedByUser++;
      return;
    }
  }

  const [documentTypeId, correspondentId, tagIds] = await Promise.all([
    resolveDocumentTypeId(classification.document_type, pools),
    resolveCorrespondentId(classification.correspondent, pools),
    Promise.all(classification.tags.map((t) => resolveTagId(t, pools))),
  ]);

  const keptExistingTagIds = full.tags.filter((id) => id !== toAiTagId);
  const finalTagIds = Array.from(
    new Set([...keptExistingTagIds, ...tagIds, processedTagId]),
  );

  if (config.DRY_RUN) {
    console.log(
      `[DRY_RUN] Would update document #${full.id}: title="${classification.title}", document_type=${documentTypeId}, correspondent=${correspondentId}, tags=${finalTagIds.join(",")}`,
    );
  } else {
    await patchDocument(full.id, {
      title: classification.title,
      document_type: documentTypeId,
      correspondent: correspondentId,
      tags: finalTagIds,
    });
    console.log(`Updated document #${full.id}: "${classification.title}"`);
  }
  summary.processed++;
}

async function main(): Promise<void> {
  console.log("Resolving tag filters…");
  const filterTagIds = await Promise.all(
    config.TAG_FILTER.map(async (name) => {
      const id = await resolveTagIdByName(name);
      if (id === null)
        throw new Error(
          `Tag "${name}" (from TAG_FILTER) not found in Paperless.`,
        );
      return id;
    }),
  );
  // First tag in TAG_FILTER is the processing marker (e.g. "to-ai") — removed on success.
  // Remaining tags are left untouched.
  const [toAiTagId] = filterTagIds;

  console.log("Fetching candidate pools…");
  const [tags, correspondents, documentTypes] = await Promise.all([
    fetchAllTags(),
    fetchAllCorrespondents(),
    fetchAllDocumentTypes(),
  ]);

  let processedTag = findByName(tags, config.PROCESSED_TAG);
  if (!processedTag) {
    processedTag = await createTag(config.PROCESSED_TAG);
    tags.push(processedTag);
  }

  const pools: Pools = {
    tags,
    correspondents,
    documentTypes,
    embeddedTags: null,
    embeddedCorrespondents: null,
  };

  if (config.EMBEDDING_STRATEGY === "embedding") {
    console.log(
      `Embedding ${tags.length} tags and ${correspondents.length} correspondents…`,
    );
    pools.embeddedTags = await embedCandidates(tags);
    pools.embeddedCorrespondents = await embedCandidates(correspondents);
  }

  console.log("Fetching documents to process…");
  const docs = await fetchDocumentsByTagIds(filterTagIds);
  console.log(
    `Found ${docs.length} document(s) tagged "${config.TAG_FILTER.join('", "')}".`,
  );

  const summary: Summary = { processed: 0, skippedByUser: 0, failed: 0 };

  for (const doc of docs) {
    try {
      await processDocument(doc, pools, processedTag.id, toAiTagId, summary);
    } catch (err) {
      summary.failed++;
      console.error(
        `Failed to process document #${doc.id}: ${(err as Error).message}`,
      );
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Processed:        ${summary.processed}`);
  console.log(`Skipped by user:  ${summary.skippedByUser}`);
  console.log(`Failed:           ${summary.failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
