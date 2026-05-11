---
"counterfact": minor
---

Add support for OpenAPI 3.2 streaming responses and Server-Sent Events (SSE) via `itemSchema`.

- `SchemaTypeCoder` now recognises `itemSchema` in a schema object and emits `AsyncIterable<T>`.
- `ResponseTypeCoder` and `OperationTypeCoder` detect `itemSchema` on streaming content types (`text/event-stream`, `application/jsonl`, `application/x-ndjson`, `application/ndjson`, `application/json-seq`) and emit `AsyncIterable<T>` as the body type instead of a plain schema type.
- `CounterfactResponseObject.body` now accepts `AsyncIterable<unknown>` in addition to `Uint8Array | string`.
- The response builder (`$.response[200].stream(iterable, contentType?)`) exposes a `stream()` helper that returns a response with the async iterable as the body. The content type defaults to `text/event-stream`.
- `routes-middleware` converts `AsyncIterable` response bodies into Node.js `Readable` streams, serialising each item in the appropriate wire format:
  - `text/event-stream` → `data: <json>\n\n`
  - `application/json-seq` → `\x1e<json>\n`
  - everything else (JSONL / ndjson) → `<json>\n`
- SSE responses also receive `Cache-Control: no-cache` and `X-Accel-Buffering: no` headers automatically.
- The JSON-serialisation middleware in `create-koa-app` now skips Node.js `Readable` stream bodies so they are piped directly to the client.
