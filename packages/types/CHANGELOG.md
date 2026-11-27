# @counterfact/types

## 0.4.0

### Minor Changes

- 2655411: Add `--generate-client`, which writes a strongly typed, fetch-based API client to `client/` next to the generated types. It has one class per module (grouped by path segment, or by first tag with `--module-name-first-tag`), a `data-contracts.ts` with a type for every schema, and an `index.ts` that combines the modules into an `Api` class. Request arguments and response data come from the generated `Routes` types.

  All transport configuration lives in an HTTP provider. The default `HttpClient` uses `fetch` and supports `baseUrl`, `baseApiParams`, `securityWorker`, and `customFetch`. Any object implementing `HttpProvider` can replace it. New options: `--module-name-index`, `--module-name-first-tag`, `--module-class-suffix`, `--type-prefix`, `--type-suffix`, `--api-class-name`, and `--unwrap-response-data`, also available as `counterfact.yaml` keys.

  `@counterfact/generator` exports `generateClient()` and accepts a `client` option in `CodeGenerator`. `@counterfact/types` exports the `Operation*` helper types the client uses.

## 0.3.0

### Minor Changes

- 354e288: Support OpenAPI 3 multipart/form-data request bodies in generated handler types
  and the built-in Koa server. Expose uploaded bytes and metadata through
  MultipartFile, decode declared fields and repeated arrays, validate required
  fields and uploads, and reject malformed or oversized multipart requests.

## 0.2.0

### Minor Changes

- b0d11b6: Add `response.status(code)` as a typed alternative to `response[code]`. Allow headers and cookies before status selection, narrowing generated status choices by header names and values while preserving required-header and body validation.

  Deprecate bracket-based `response[statusCode]` selection in favor of `response.status(statusCode)`. Update documentation and generated route stubs to use the function-based selector; existing bracket-based handlers remain supported.
