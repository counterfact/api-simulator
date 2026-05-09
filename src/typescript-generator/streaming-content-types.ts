/**
 * Content types that represent sequential/streaming media in OpenAPI 3.2.
 *
 * When a Media Type Object uses `itemSchema` together with one of these content
 * types, the generated TypeScript body type is `AsyncIterable<T>` rather than
 * a plain schema type.  On the server side, returning an `AsyncIterable` for
 * one of these content types causes Counterfact to stream each item in the
 * appropriate wire format.
 */
export const STREAMING_CONTENT_TYPES = new Set([
  "text/event-stream",
  "application/jsonl",
  "application/x-ndjson",
  "application/ndjson",
  "application/json-seq",
]);
