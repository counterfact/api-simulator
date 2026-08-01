# `src/counterfact-types/` — Exported Type Definitions

This directory contains the TypeScript type definitions that are part of Counterfact's public API. These types are re-exported from the package root and are available to consumers (i.e. code inside a project's `routes/` directory).

## Files

| File | Description |
|---|---|
| `index.ts` | Re-exports all public types from the individual files below |
| `cookie-options.ts` | `CookieOptions` — options for setting an HTTP cookie (domain, path, maxAge, etc.) |
| `counterfact-response.ts` | `COUNTERFACT_RESPONSE` — the terminal branded type returned by a completed response builder |
| `example.ts` | `Example` — a named example entry from an OpenAPI document (summary, description, value) |
| `example-names.ts` | `ExampleNames<Response>` — extracts the union of named example keys from an OpenAPI response |
| `generic-response-builder.ts` | `GenericResponseBuilderInner<Response>` and `GenericResponseBuilder<Response>` — the strongly-typed fluent response builder generated for each route handler, along with its internal helper types (`NeverIfEmpty`, `SchemasOf`, `MaybeShortcut`, `MatchFunction`, `HeaderFunction`) |
| `http-status-code.ts` | `HttpStatusCode` — union of all standard HTTP status code numbers |
| `if-has-key.ts` | `IfHasKey<SomeObject, Keys, Yes, No>` — conditional type that resolves to `Yes` when `SomeObject` has a key matching any string in `Keys` |
| `maybe-promise.ts` | `MaybePromise<T>` — a value that is either `T` or `Promise<T>` |
| `media-type.ts` | `MediaType` — a string in the form `type/subtype` representing an IANA media type |
| `middleware.ts` | `Middleware<Context>` and related request/response types for custom `_.middleware.ts` files |
| `omit-all.ts` | `OmitAll<T, K>` — removes all keys from `T` whose names contain any string in `K` as a substring |
| `omit-value-when-never.ts` | `OmitValueWhenNever<Base>` — strips keys from `Base` whose value type is `never` |
| `open-api-content.ts` | `OpenApiContent` — a single content entry in an OpenAPI response (schema only) |
| `open-api-header.ts` | `OpenApiHeader` — a single HTTP response header as modelled in an OpenAPI document |
| `open-api-operation.ts` | `OpenApiOperation` — an HTTP operation (parameters, requestBody, responses) from an OpenAPI document |
| `open-api-parameters.ts` | `OpenApiParameters` — a single parameter definition (path, query, header, etc.) from an OpenAPI document |
| `open-api-response.ts` | `OpenApiResponse` and `OpenApiResponses` — a single HTTP response definition and a map of status codes to responses |
| `random-function.ts` | `RandomFunction` — the type of the `.random()` method on the response builder |
| `response-builder.ts` | `ResponseBuilder` — a loosely-typed chainable response builder for non-generated contexts |
| `response-builder-factory.ts` | `ResponseBuilderFactory<Responses>` — maps status codes to their `GenericResponseBuilder` instances |
| `versioned.ts` | `Versioned<TVersions, TVersionsGTE, T, V>` — generic utility type that narrows the `$` argument of a multi-version route handler; for per-project use, import the project-specific `Versioned` from the generated `types/versions.ts` instead |
| `wide-operation-argument.ts` | `WideOperationArgument` — the loosely-typed argument object for wide (catch-all) route handlers |
| `wide-response-builder.ts` | `WideResponseBuilder` — a loosely-typed response builder for wide route handlers |

## Usage

These types are typically imported via the generated type files rather than directly. However, when writing custom middleware or context files that need access to low-level response builder types, you can import from the package root:

```ts
import type { ResponseBuilder } from "counterfact";
```
