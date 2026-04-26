---
title: "OpenAPI 3.2: Support streaming responses and SSE via itemSchema"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 introduces first-class support for streaming responses via sequential media types such as `text/event-stream` (Server-Sent Events), `multipart/mixed`, `application/jsonl`, and `application/json-seq`. A new `itemSchema` field in the Media Type Object describes the schema of each individual item in the stream; responses are conceptually treated as arrays of schema instances.

## Current state

Counterfact generates typed response builders and can return example data from the spec, but has no concept of streaming or server-sent events. The `text/event-stream` content type is not specially handled in `src/typescript-generator/response-type-coder.ts`, `src/typescript-generator/schema-type-coder.ts`, or the Koa layer.

## Proposed changes

- Recognise `itemSchema` in `src/typescript-generator/schema-type-coder.ts` and `src/typescript-generator/response-type-coder.ts` and generate `Array<T>` (or `AsyncIterable<T>`) types for it
- In the server layer (`src/server/koa-middleware.ts`), when a request accepts `text/event-stream`, send an SSE-formatted response using Node.js streams instead of a one-shot JSON body
- Expose a helper on the `$` argument (similar to `$.proxy`) that allows route handlers to push events to a stream
- Handle `application/jsonl` and `application/json-seq` sequential media types in a similar fashion

## Acceptance criteria

- [ ] A response with `itemSchema` and content type `text/event-stream` generates an `AsyncIterable<T>` (or equivalent) handler type
- [ ] A route handler returning an async iterable via the SSE helper sends properly formatted `data: ...` SSE events to the client
- [ ] A route handler for `application/jsonl` sends newline-delimited JSON chunks
- [ ] Existing non-streaming routes are unaffected
- [ ] The generated TypeScript for a streaming route passes `tsc --noEmit` without errors
- [ ] Unit and/or integration tests cover SSE response generation
