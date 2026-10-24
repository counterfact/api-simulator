# Request and response validation

Validation helps reveal mismatches between traffic and a loaded OpenAPI contract. Generated TypeScript types guide handler authors; runtime validation examines supported parts of actual traffic.

## Keep validation enabled

Request and response validation are enabled by default. Start the simulator with a specification, send a valid request, then omit a required input and inspect the response. Request validation checks required query, header, and cookie parameters and validates supported request-body schemas. Invalid requests are rejected with 400 before the handler runs.

## Runtime coverage

| Traffic property                                       | Current check                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required query, header, and cookie parameters          | Presence checks. Header names are case-insensitive. Exploded object query parameters use their property names.                                                                                               |
| Parameter value schemas, including optional parameters | Not generally validated here; parsing/coercion and generated types are separate mechanisms.                                                                                                                  |
| Path parameters                                        | Routing extracts the path; this validator does not check path-parameter schemas.                                                                                                                             |
| OpenAPI 3 request body                                 | Selects `application/json` schema first, or `application/x-www-form-urlencoded` schema if JSON is absent, and passes the parsed body to AJV. It does not choose a schema by the request's actual media type. |
| Swagger 2 body parameter                               | Passes its schema and parsed body to AJV.                                                                                                                                                                    |
| Other request-body media types                         | No general schema check. Where no selected schema exists, a required body is checked for presence. Multipart/file validation is not a conformance guarantee.                                                 |
| Declared response headers                              | Required presence and schema checks for the applicable status/default response; numeric and boolean header strings are coerced for validation.                                                               |
| Response bodies and streaming items                    | No general schema validation.                                                                                                                                                                                |
| Configuration-selected upstream traffic                | Bypasses local dispatch validation. Route-level `$.proxy()` runs through local checks.                                                                                                                       |

The current AJV instance uses its default JSON Schema dialect, `strict: false`, and `coerceTypes: false` for request bodies. Common type, required-field, enum, and object/array constraints are useful checks; this is not full OpenAPI 3.1/3.2 JSON Schema-dialect coverage. Optional formats and dialect-specific keywords are not promised. Exercise representative schemas before relying on a contract gate.

## Understand response checks

Response validation currently checks declared response headers, including required headers and their schemas. It does **not** perform general response-body schema validation. An undeclared response status with no applicable default response is not rejected merely for being undeclared. Streaming content is not a promise of item-by-item runtime schema validation.

When supported response checks fail, the server adds `response-type-error` headers and keeps the handler’s status and body. Do not treat these checks as a complete OpenAPI conformance suite.

## Make advisory errors fail a test

After starting the simulator and obtaining `baseUrl`, a Node test can make supported response-header diagnostics actionable:

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
