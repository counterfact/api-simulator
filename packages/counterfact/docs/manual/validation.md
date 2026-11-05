# Request and response validation

Validation helps reveal mismatches between traffic and a loaded OpenAPI contract. Generated TypeScript types guide handler authors; runtime validation examines supported parts of actual traffic.

## Keep validation enabled

Request and response validation are enabled by default. Start the simulator with a specification, send a valid request, then omit a required input and inspect the response. Request validation checks required query, header, and cookie parameters and validates supported request-body schemas. Invalid requests are rejected with 400 before the handler runs.

## Runtime coverage

| Traffic property                                       | Current check                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required query, header, and cookie parameters          | Presence checks. Header names are case-insensitive. Exploded object query parameters use their property names.                                                                                                                     |
| Parameter value schemas, including optional parameters | Not generally validated here; parsing/coercion and generated types are separate mechanisms.                                                                                                                                        |
| Path parameters                                        | Routing extracts the path; this validator does not check path-parameter schemas.                                                                                                                                                   |
| OpenAPI 3 request body                                 | Selects the declared request media type (exact, subtype wildcard, then full wildcard) and validates its parsed body. Without a media-type header, programmatic requests use the JSON, URL-encoded, then multipart schema fallback. |
| Swagger 2 body parameter                               | Passes its schema and parsed body to AJV.                                                                                                                                                                                          |
| Other request-body media types                         | Present bodies with undeclared media types are rejected. Other declared media types still depend on available parsing; this is not a complete media-type conformance guarantee.                                                    |
| Declared response headers                              | Required presence and schema checks for the applicable status/default response; numeric and boolean header strings are coerced for validation.                                                                                     |
| Response bodies and streaming items                    | No general schema validation.                                                                                                                                                                                                      |
| Configuration-selected upstream traffic                | Bypasses local dispatch validation. Route-level `$.proxy()` runs through local checks.                                                                                                                                             |

Request-body schema validation stops at the first validation failure rather than collecting an error for every invalid item or field. This limits error-allocation work for malformed input. Required-parameter presence errors are still reported together.

The current AJV instance uses its default JSON Schema dialect, `strict: false`, and `coerceTypes: false` for request bodies. Common type, required-field, enum, and object/array constraints are useful checks; this is not full OpenAPI 3.1/3.2 JSON Schema-dialect coverage. Optional formats and dialect-specific keywords are not promised. Test the schemas your API uses before relying on these checks.

Boolean query, header, and cookie values are an exception to the general parameter-schema limitation: the case-sensitive strings true and false are accepted, while malformed text returns 400 before the handler runs. With request validation disabled, malformed boolean text remains unchanged.

Optional request bodies may be absent. A present body, including explicit JSON null, is validated against the selected schema. Required bodies reject absence. This rule also applies to Swagger 2 body parameters.

## Recursive request bodies

Dereferenced recursive request schemas are converted back to JSON Schema references for AJV compilation. Finite nested values retain their recursive constraints; both self-recursive and mutually recursive schemas are supported.

Recursive schema normalization preserves boolean schemas, nested id resources, and property names that require URI-fragment encoding.

## Understand response checks

Response validation currently checks declared response headers, including required headers and their schemas. It does **not** perform general response-body schema validation. An undeclared response status with no applicable default response is not rejected merely for being undeclared. Streaming items are not checked against their response schemas.

When supported response checks fail, the server adds `response-type-error` headers and keeps the handler’s status and body. Do not treat these checks as a complete OpenAPI conformance suite.

## Make advisory errors fail a test

After starting the simulator and obtaining `baseUrl`, fail your Node test if the response contains a `response-type-error` header:

```js
import assert from "node:assert/strict";
const response = await fetch(`${baseUrl}/status`);
const body = await response.text();
assert.equal(response.status, 200, body);
assert.equal(response.headers.get("response-type-error"), null);
```

This assertion belongs in a Node test. Browser JavaScript may not be allowed to read that header unless CORS exposes it. Assert the body separately for the workflow you intend to simulate; an absent diagnostic is not proof of response-body conformance. See [the contract-change recipe](../patterns/contract-change.md).

## Disable checks for a deliberate experiment

```sh
npx counterfact ./openapi.yaml api --no-validate-request --no-validate-response
```

From code, pass `validateRequests: false` or `validateResponses: false`. These flags are independent of `$.x`, which widens TypeScript types but does not itself turn validation off.

Without a specification there is no operation contract to validate against. See [CLI configuration](../api/cli.md) and [handler arguments](../api/handlers.md).

Array query parameters using default form/explode serialization reach handlers as
arrays even for one occurrence. Repeated occurrences retain their order. Optional
missing parameters remain absent, and nullable array schemas retain this behavior.
Explicit form serialization with explode false splits commas; spaceDelimited and
pipeDelimited split their declared separators. Default exploded arrays do not
split commas. Declared primitive items receive number or boolean conversion for
valid values; malformed text remains visible. Other styles are left unchanged.

Enclosing schema constraints remain active around array unions. Tuple prefix
schemas apply by item position before the trailing items schema. Numeric item
conversion accepts finite decimal text, preserving radix forms and malformed
text. Explicit explode true preserves each query occurrence as one item,
including spaces and pipe characters inside that item.

The built-in HTTP server preserves an omitted body as absent; it does not replace it with an empty object. Explicit empty objects and JSON null remain present values for schema validation.
