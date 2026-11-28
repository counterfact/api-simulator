# Response builders

Start with `$.response.status(status)`, using an HTTP status declared for the operation. It narrows the available body methods, schemas, examples, and required headers to the selected response. Chain body and header methods and return the result from the handler.

Bracket-based status selection, `$.response[statusCode]`, is deprecated. Replace it with `$.response.status(statusCode)`; for example, `$.response[200].json(body)` becomes `$.response.status(200).json(body)`. Existing handlers using brackets remain supported.

## Headers and cookies before status selection

You can supply `.header(name, value)` and `.cookie(name, value, options?)` before selecting a status. In generated handlers, each header narrows the valid status codes to responses that declare that header and accept its value. It also satisfies that header's requirement. Cookies preserve the available status choices.

```ts
return $.response
  .header("x-request-id", "abc123")
  .status(200)
  .json({ ok: true });
```

The example requires a response declaring `x-request-id`. If only the 200 response declares it, `.status(404)` after that header is a type error. With an OpenAPI `default` response, other status codes use the default response's schema.

## Methods after status selection

| Method                           | Description                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `.random()`                      | Random data generated from the OpenAPI schema (uses `examples` where available) |
| `.example(name)`                 | A specific named example from the OpenAPI spec                                  |
| `.empty()`                       | Explicitly returns a response with no body (use for 204 No Content and similar) |
| `.json(content)`                 | JSON body (also converts to XML automatically when the client requests it)      |
| `.text(content)`                 | Plain-text body                                                                 |
| `.html(content)`                 | HTML body                                                                       |
| `.xml(content)`                  | XML body                                                                        |
| `.binary(body)`                 | Raw bytes or decoded base64 with `application/octet-stream`                     |
| `.match(contentType, content)`   | Body with an explicit content type; chain multiple for content negotiation      |
| `.header(name, value)`           | Adds a response header                                                          |
| `.cookie(name, value, options?)` | Adds a `Set-Cookie` header                                                      |

```ts
return $.response
  .status(200)
  .header("x-request-id", "abc123")
  .cookie("session", "xyz", { httpOnly: true })
  .json({ ok: true });
```

## Binary responses

`.binary(body)` accepts a `Buffer`, `Uint8Array`, or base64-encoded string and sends bytes with `Content-Type: application/octet-stream`. Strings are decoded as base64, not sent as literal text. The helper does not infer a media type from the spec or the file bytes. In generated handlers, it is available when the selected response declares `application/octet-stream`.

For a PDF or another non-XML file type, use `.match(contentType, buffer)` with a Node.js `Buffer`:

```ts
return $.response.status(200).match("application/pdf", pdfBuffer);
```

Declare `application/pdf` with a `type: string`, `format: binary` schema in that response's OpenAPI content. See the [binary file example](../manual/responses.md#sending-a-pdf-or-other-binary-file) for the spec and body preparation. `.match()` does not decode base64 strings or convert a plain `Uint8Array` to a `Buffer`; prepare those inputs with `Buffer.from(base64, "base64")` or `Buffer.from(bytes)` first. `application/xml` and `text/xml` use XML serialization rather than this raw-file path.

The request's `Accept` header is matched against the representation supplied by the body method. If `.binary(body)` is the only representation and the client requests only `application/pdf`, Counterfact returns 406 because `application/octet-stream` does not match. Declaring PDF in the spec or setting a `Content-Type` header does not change the representation registered by `.binary()`; use `.match("application/pdf", pdfBuffer)` instead.

## Streaming

`.stream(iterable)` accepts an async iterable. The response's OpenAPI streaming media type determines serialization. Supported formats include SSE, JSONL/ndjson, and JSON sequences. See [streaming responses](../manual/streaming.md).

## Content negotiation

Chain `.match(contentType, content)` to offer explicit representations. An unsupported `Accept` header can produce a 406 response. A 406 response may be plain text; inspect its content type before decoding it.

## Cookies

`.cookie(name, value, options?)` appends `Set-Cookie`. Options are `path`, `domain`, `maxAge` (seconds), `expires` (Date), `httpOnly`, `secure`, and `sameSite` (`lax`, `strict`, or `none`).
