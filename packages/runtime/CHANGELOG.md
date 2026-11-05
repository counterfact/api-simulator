# @counterfact/runtime

## 0.4.1

### Patch Changes

- 4069652: Use canonical ESM URLs on initial module load to preserve context class identity.
- 9f9fd7e: Compile dereferenced recursive request schemas using JSON Schema back references.

## 0.4.0

### Minor Changes

- 354e288: Support OpenAPI 3 multipart/form-data request bodies in generated handler types
  and the built-in Koa server. Expose uploaded bytes and metadata through
  MultipartFile, decode declared fields and repeated arrays, validate required
  fields and uploads, and reject malformed or oversized multipart requests.

### Patch Changes

- 7503f57: Normalize declared array query parameters consistently for single and repeated values, nullable arrays, primitive items, and explicit form/space/pipe serialization.

  Retain enclosing schema and tuple-prefix item constraints, preserve explicitly
  exploded items, and avoid converting non-decimal numeric text.

- 610b1fc: Reject malformed boolean query, header, and cookie values before handlers run.
- c9cae8c: Convert nullable primitive parameters using their non-null primitive type.
- 83e11d3: Allow omitted optional request bodies while validating explicit null and present bodies.
- c77a381: Stop request-body validation at the first failure instead of collecting errors for every invalid field or item, avoiding excessive error allocation from malformed input.
- 2bbdca5: Restrict versioned dispatchers to operations in the selected contract.
- Updated dependencies [354e288]
  - @counterfact/types@0.3.0

## 0.3.2

### Patch Changes

- 40656be: Require Node 22.22 or later for Chokidar 6 compatibility.
- 93944c6: Updated dependency `chokidar` in `@counterfact/generator` to `6.0.0`.
  Updated dependency `chokidar` in `@counterfact/runtime` to `6.0.0`.
- Updated dependencies [1f340b6]
  - @counterfact/openapi@0.1.7

## 0.3.1

### Patch Changes

- ad9068d: Use Swagger UI 5.32.0 so documentation pages render OpenAPI 3.0.4 and 3.2.0 documents instead of reporting an invalid version field.
- 9871d4c: Print distinct Swagger UI links for versioned APIs and serve the selected version's OpenAPI document and request prefix instead of always showing the first version in the group.

## 0.3.0

### Minor Changes

- b0d11b6: Add `response.status(code)` as a typed alternative to `response[code]`. Allow headers and cookies before status selection, narrowing generated status choices by header names and values while preserving required-header and body validation.

  Deprecate bracket-based `response[statusCode]` selection in favor of `response.status(statusCode)`. Update documentation and generated route stubs to use the function-based selector; existing bracket-based handlers remain supported.

### Patch Changes

- 70cbe2e: Preserve live object and array context state when unchanged declarations reload. Scenario-seeded inventory, request updates, and REPL edits now survive context reloads; deliberately changed initializers still apply.
- Updated dependencies [b0d11b6]
  - @counterfact/types@0.2.0

## 0.2.0

### Minor Changes

- 96b565d: Add simulator.reset() to reconstruct stores, dependent contexts, source routes and startup state without restarting HTTP, and simulator.scenario(path, group?) to await named scenarios with the REPL arguments. Document request gating, reset failure recovery, reference lifetimes, and worker-scoped Playwright integration.

### Patch Changes

- 376ec98: Updated dependency `js-yaml` in `counterfact` to `5.5.0`.
  Updated dependency `js-yaml` in `@counterfact/openapi` to `5.5.0`.
  Updated dependency `js-yaml` in `@counterfact/runtime` to `5.5.0`.
- Updated dependencies [865750a]
- Updated dependencies [376ec98]
- Updated dependencies [91428ea]
  - @counterfact/openapi@0.1.6

## 0.1.5

### Patch Changes

- 1714e9a: Classify OpenAPI sources consistently and hot-reload local base documents and overlays without mistaking local `http`-prefixed paths for remote URLs.
- 02d013a: Validate responses that omit an explicit status against the OpenAPI `200` response definition.
- 25215f4: Updated dependency `js-yaml` in `counterfact` to `5.4.1`.
  Updated dependency `js-yaml` in `@counterfact/openapi` to `5.4.1`.
  Updated dependency `js-yaml` in `@counterfact/runtime` to `5.4.1`.
- befb686: Updated dependency `js-yaml` in `counterfact` to `5.4.3`.
  Updated dependency `js-yaml` in `@counterfact/openapi` to `5.4.3`.
  Updated dependency `js-yaml` in `@counterfact/runtime` to `5.4.3`.
- 15b30fb: Updated dependency `js-yaml` in `counterfact` to `5.4.2`.
  Updated dependency `js-yaml` in `@counterfact/openapi` to `5.4.2`.
  Updated dependency `js-yaml` in `@counterfact/runtime` to `5.4.2`.
- ba93689: Updated dependency `koa-proxies` in `@counterfact/runtime` to `0.12.6`.
- Updated dependencies [1714e9a]
- Updated dependencies [a2ee147]
- Updated dependencies [dfe2472]
- Updated dependencies [25215f4]
- Updated dependencies [befb686]
- Updated dependencies [2e0cadd]
- Updated dependencies [15b30fb]
- Updated dependencies [cfcedc9]
- Updated dependencies [e5105a0]
- Updated dependencies [2707325]
- Updated dependencies [66ab7eb]
- Updated dependencies [d175f35]
  - @counterfact/openapi@0.1.5

## 0.1.4

### Patch Changes

- 99dab55: Updated dependency `js-yaml` in `counterfact` to `5.4.0`.
  Updated dependency `js-yaml` in `@counterfact/openapi` to `5.4.0`.
  Updated dependency `js-yaml` in `@counterfact/runtime` to `5.4.0`.
- Updated dependencies [99dab55]
  - @counterfact/openapi@0.1.4

## 0.1.3

### Patch Changes

- f90e88d: Normalize route-prefix trailing slashes in linear time.
- fb73d12: Match configured route prefixes at URL path-segment boundaries.
- 8712a09: Stop random response generation from logging internal options to stdout.
- 8b13036: Avoid generating duplicate required response headers with different casing.
- afc52c0: Apply OpenAPI header parameter types regardless of header-name casing.
- 3bfb75d: Validate response headers case-insensitively as required by HTTP.
- Updated dependencies [28aafab]
  - @counterfact/openapi@0.1.3

## 0.1.2

### Patch Changes

- 669d9dd: Updated dependency `js-yaml` in `@counterfact/openapi`, `@counterfact/runtime`, and `counterfact` to `5.3.0`.
- Updated dependencies [669d9dd]
  - @counterfact/openapi@0.1.2

## 0.1.1

### Patch Changes

- 5d1ea2e: Treat required request header names as case-insensitive during validation.
- Updated dependencies [f5e437d]
  - @counterfact/openapi@0.1.1
