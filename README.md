# paperlessAIProcessor

Automatic document classification for [Paperless-ngx](https://docs.paperless-ngx.com/), powered by a local [Ollama](https://ollama.com/) LLM.

Tag documents `to-ai` in Paperless-ngx, run this tool, and it will propose a title, document type, correspondent, and tags for each one using an LLM — then apply the changes back via the Paperless API.

## How it works

1. Fetches all documents tagged with `TAG_FILTER` from Paperless-ngx.
2. Builds a candidate shortlist of existing tags/correspondents per document, either by embedding similarity (Ollama embedding model) or simple lexical matching.
3. Sends the document text plus the shortlist to an Ollama chat model, which returns a structured classification (validated with Zod).
4. Prompts for confirmation before applying (unless `AUTO_MODE=true`), then patches the document via the Paperless API and swaps the `to-ai` tag for `ai-processed`.
5. Prints a summary of processed / skipped / failed documents.

## Requirements

- Node.js
- A running [Paperless-ngx](https://docs.paperless-ngx.com/) instance with an API token
- A running [Ollama](https://ollama.com/) instance with a chat model and an embedding model pulled

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

| Variable | Description | Default |
|---|---|---|
| `PAPERLESS_BASE_URL` | Base URL of your Paperless-ngx instance | — |
| `PAPERLESS_API_TOKEN` | Paperless API token | — |
| `OLLAMA_BASE_URL` | Base URL of your Ollama instance | — |
| `OLLAMA_MODEL` | Chat model used for classification | — |
| `OLLAMA_EMBED_MODEL` | Embedding model used for candidate matching | — |
| `TAG_FILTER` | Tag(s) marking documents to process; first tag is removed on success (`;`-separated) | `to-ai` |
| `PROCESSED_TAG` | Tag applied after successful processing | `ai-processed` |
| `CANDIDATE_LIMIT` | Max tag/correspondent candidates shortlisted per document | `50` |
| `EMBEDDING_STRATEGY` | `embedding` or `lexical` candidate matching | `embedding` |
| `DRY_RUN` | Log intended changes without writing to Paperless | `false` |
| `AUTO_MODE` | Skip the confirmation prompt and apply automatically | `false` |

## Usage

```bash
npm start
```

By default you'll be shown a preview of each document and asked to confirm before changes are applied. Set `AUTO_MODE=true` to run unattended, or `DRY_RUN=true` to preview without writing anything.

## Scripts

- `npm start` — run the classifier
- `npm run typecheck` — type-check with `tsc`
