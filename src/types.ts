import { z } from "zod";

export const TagSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type Tag = z.infer<typeof TagSchema>;

export const CorrespondentSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type Correspondent = z.infer<typeof CorrespondentSchema>;

export const DocumentTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const PaperlessDocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string().optional().default(""),
  tags: z.array(z.number()),
  correspondent: z.number().nullable().optional(),
  document_type: z.number().nullable().optional(),
  original_file_name: z.string().optional(),
});
export type PaperlessDocument = z.infer<typeof PaperlessDocumentSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(item),
  });
}

export const CandidatePoolSchema = z.object({
  tags: z.array(TagSchema),
  correspondents: z.array(CorrespondentSchema),
  documentTypes: z.array(DocumentTypeSchema),
});
export type CandidatePool = z.infer<typeof CandidatePoolSchema>;

export interface EmbeddedItem<T> {
  item: T;
  embedding: number[];
}

export const ClassificationResponseSchema = z.object({
  title: z.string().min(1),
  document_type: z.string().min(1),
  correspondent: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>;

export const OllamaEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
});

export const OllamaChatResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
});

export interface ResolvedClassification {
  title: string;
  documentTypeId: number;
  correspondentId: number;
  tagIds: number[];
}
