---
"counterfact": minor
"@counterfact/generator": minor
"@counterfact/types": minor
---

Add `--generate-client`, which writes a strongly typed, fetch-based API client to `client/` next to the generated types. It has one class per module (grouped by path segment, or by first tag with `--module-name-first-tag`), a `data-contracts.ts` with a type for every schema, and an `index.ts` that combines the modules into an `Api` class. Request arguments and response data come from the generated `Routes` types.

All transport configuration lives in an HTTP provider. The default `HttpClient` uses `fetch` and supports `baseUrl`, `baseApiParams`, `securityWorker`, and `customFetch`. Any object implementing `HttpProvider` can replace it. New options: `--module-name-index`, `--module-name-first-tag`, `--module-class-suffix`, `--type-prefix`, `--type-suffix`, `--api-class-name`, and `--unwrap-response-data`, also available as `counterfact.yaml` keys.

`@counterfact/generator` exports `generateClient()` and accepts a `client` option in `CodeGenerator`. `@counterfact/types` exports the `Operation*` helper types the client uses.
