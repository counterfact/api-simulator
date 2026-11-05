# Recorded responses with `$.har()`

Place plain HAR files under your generated project's `har/` directory, then opt into recorded responses in a handler:

```ts
import type { HTTP_GET } from "../types/paths/items.types.js";

export const GET: HTTP_GET = ($) =>
  $.har() ?? $.response[404].text("No recording matched");
```

`$.har()` synchronously returns a complete recorded response or `undefined`. Use JavaScript's `??` operator to supply any fallback, including the existing `$.response[200].random()`. A recorded empty response, including `204`, counts as a match.

## Apply recordings with middleware

Use middleware to try recorded responses across a group of routes without adding `$.har()` to each handler:

```ts
// routes/_.middleware.ts
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = ($, respondTo) => $.har() ?? respondTo($);
```

A matching recording returns immediately. On a miss, `respondTo($)` continues through the remaining middleware to the route handler, preserving its existing fallback behavior.

Custom matching works the same way:

```ts
// routes/_.middleware.ts
import type { Middleware } from "../types/_.middleware.js";

export const middleware: Middleware = ($, respondTo) =>
  $.har(({ defaultMatch, match }) => defaultMatch && match("header", "x-id")) ??
  respondTo($);
```

Place the file at the root of `routes/` to cover all registered routes, or in a subdirectory such as `routes/payments/` to cover that subtree. For nested middleware, import its corresponding generated type, such as `../../types/payments/_.middleware.js`.

Requests need a registered route handler for the middleware chain to run. Global proxying bypasses that chain. A HAR match skips the remaining middleware and the route handler, so run any checks that must always execute before the HAR lookup.

See [Middleware](./middleware.md) for middleware ordering and generated types.

## Recordings and reload

Counterfact recursively reads `.har` files from `<project>/har/`. Named API groups use `<project>/<group>/har/`; versions within a group share recordings. Files are sorted by relative filename, then exchanges retain their original entry order. The first match wins and can be reused indefinitely. Requests do not consume recordings.

A missing directory is valid. Adding, editing, or removing recordings updates the running server without restarting or changing context state. Invalid JSON prevents initial startup; an invalid live edit reports an error and retains the last good collection until a successful reload. An invalid or unsupported individual exchange is skipped with a filename, entry index, and reason.

The existing MSW loader reads the same directory when creating handlers, without adding a watcher. Direct runtime integrations can create and load an exported `HarCollection` and pass it as the dispatcher's optional final constructor argument; the integration owns its watcher lifecycle.

## Default matching

The default matcher compares:

- Uppercase HTTP method and exact public pathname, before Counterfact removes routing prefixes. Origins and request headers are ignored.
- Decoded query parameter names and values. The order of different names does not matter; duplicate values and their order do.
- Request bodies: structural JSON equality, decoded name/value comparison for URL-encoded forms, and exact text equality otherwise. JSON object key order does not matter; array order and scalar types do. An absent body differs from an explicitly empty body.

Matching uses a snapshot before OpenAPI coercion or middleware mutation. If the captured and local path prefixes differ, supply a predicate. Missing request content and multipart request bodies do not match by default.

## Custom matching

A predicate replaces the default matching rules. It receives one object containing `request`, `entry`, `match`, and `defaultMatch` for each replayable exchange in selection order:

```ts
return (
  $.har(
    ({ request, entry }) =>
      request.method === entry.request.method &&
      request.pathname === entry.request.pathname &&
      request.query.category?.[0] === entry.request.query.category?.[0],
  ) ?? $.response[404].text("No recording matched")
);
```

Request snapshots expose `method`, `pathname`, `query`, `headers`, `body`, `rawBody`, and `bodyAvailable`. Queries and lowercase headers map names to arrays of strings. JSON bodies are parsed; other captured bodies retain their text. Each entry also exposes `response` (`status`, `headers`, `contentType`, `body`), `filename` relative to `har/`, and zero-based `entryIndex`.

To keep default matching and additionally compare a header:

```ts
return (
  $.har(({ defaultMatch, match }) => defaultMatch && match("header", "x-id")) ??
  $.response[404].text("No recording matched")
);
```

`defaultMatch` is a boolean with the result of the normal method/path/query/body algorithm.

`match(key)` compares an entire request field: `method`, `pathname`, `query`, `body`, `headers`, `rawBody`, or `bodyAvailable`. `pathname` compares the concrete public pathname, not the OpenAPI route template. `match("header", name)` and `match("query", name)` compare one header or query parameter. Header names are case-insensitive; query names are case-sensitive. Repeated values are compared in order. If the selected field is absent on both sides, it matches. Body comparison uses the same JSON/form/text rules as default matching.

Arguments are isolated copies, so predicate changes cannot modify the recording collection. `match` and `defaultMatch` always use the original snapshots, independent of predicate mutations. Predicates must synchronously return a boolean. Predicate exceptions propagate as request errors; they do not trigger the fallback.

## Supported content

HAR response content must be embedded text or base64. Missing response content is skipped unless the recording explicitly identifies an empty response or the method/status requires no body. ZIP archives, external payload attachments, and multipart request matching are unsupported. Export embedded content when recording with tools that offer a storage choice.

Recorded status, content type, body and repeated headers are preserved, including separate `Set-Cookie` values. Stale length/encoding and hop-by-hop headers are removed. Normal Counterfact request validation, response validation, content negotiation and CORS still apply. Global proxying bypasses handlers and therefore bypasses `$.har()`.

Recordings do not reproduce elapsed time, stream event timing, or WebSocket conversations. Redirect responses are returned to the client without an automatic upstream fetch.

HAR files can contain credentials and personal data in headers, URLs and bodies. Review and redact recordings locally before committing them. Counterfact does not upload recordings or log captured payloads in load diagnostics.

MSW requests use their concrete public path (including any base path) for recording matching; rawPath selects the registered handler pattern. Known omitted HAR request payloads do not match bodyless requests by default. Response media-type parameters are preserved while negotiation compares the media type, and singleton transport header arrays validate against scalar schemas without flattening repeated wire headers.

Binary wire bodies, including multipart uploads, are not coerced into text for HAR request matching. Default replay declines these inputs; handlers and proxying retain the original upload bytes.
