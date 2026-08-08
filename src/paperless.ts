import { config } from "./config.js";
import {
  CorrespondentSchema,
  DocumentTypeSchema,
  PaperlessDocument,
  PaperlessDocumentSchema,
  Tag,
  TagSchema,
  paginatedSchema,
  type Correspondent,
  type DocumentType,
} from "./types.js";

const BASE = config.PAPERLESS_BASE_URL.replace(/\/+$/, "");

async function paperlessFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.PAPERLESS_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Token ${config.PAPERLESS_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Paperless API ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText} ${body}`,
      );
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllPages<T>(
  path: string,
  itemSchema: import("zod").ZodType<T>,
): Promise<T[]> {
  const schema = paginatedSchema(itemSchema);
  const results: T[] = [];
  let next: string | null = path;
  let first = true;
  while (next) {
    const res = await paperlessFetch(first ? next : next.replace(BASE, ""));
    first = false;
    const json = await res.json();
    const parsed = schema.parse(json);
    results.push(...parsed.results);
    next = parsed.next;
  }
  return results;
}

export async function resolveTagIdByName(name: string): Promise<number | null> {
  const res = await paperlessFetch(
    `/api/tags/?name__iexact=${encodeURIComponent(name)}`,
  );
  const json = await res.json();
  const parsed = paginatedSchema(TagSchema).parse(json);
  return parsed.results[0]?.id ?? null;
}

export async function fetchAllTags(): Promise<Tag[]> {
  return fetchAllPages("/api/tags/?page_size=1000", TagSchema);
}

export async function fetchAllCorrespondents(): Promise<Correspondent[]> {
  return fetchAllPages(
    "/api/correspondents/?page_size=1000",
    CorrespondentSchema,
  );
}

export async function fetchAllDocumentTypes(): Promise<DocumentType[]> {
  return fetchAllPages(
    "/api/document_types/?page_size=1000",
    DocumentTypeSchema,
  );
}

export async function fetchDocumentsByTagIds(
  tagIds: number[],
): Promise<PaperlessDocument[]> {
  const idParam = tagIds.join(",");
  return fetchAllPages(
    `/api/documents/?tags__id__all=${encodeURIComponent(idParam)}&page_size=100`,
    PaperlessDocumentSchema,
  );
}

export async function fetchDocumentDetail(
  id: number,
): Promise<PaperlessDocument> {
  const res = await paperlessFetch(`/api/documents/${id}/`);
  const json = await res.json();
  return PaperlessDocumentSchema.parse(json);
}

export async function createTag(name: string): Promise<Tag> {
  const res = await paperlessFetch("/api/tags/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return TagSchema.parse(await res.json());
}

export async function createCorrespondent(
  name: string,
): Promise<Correspondent> {
  const res = await paperlessFetch("/api/correspondents/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return CorrespondentSchema.parse(await res.json());
}

export async function createDocumentType(name: string): Promise<DocumentType> {
  const res = await paperlessFetch("/api/document_types/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return DocumentTypeSchema.parse(await res.json());
}

export interface DocumentPatch {
  title?: string;
  correspondent?: number | null;
  document_type?: number | null;
  tags?: number[];
}

export async function patchDocument(
  id: number,
  patch: DocumentPatch,
): Promise<void> {
  await paperlessFetch(`/api/documents/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
