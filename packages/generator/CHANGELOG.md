# @counterfact/generator

## 1.0.0

### Major Changes

- 442afd2: Generate operation and parameter types with stable HTTP method names such as
  `HTTP_GET` and `HTTP_GET_Query`, independent of OpenAPI operationId. On CLI
  startup, automatically migrate legacy operationId-based route imports and their
  references while preserving route logic, explicit aliases, comments, and strings.
  References outside route files must be updated manually.

### Minor Changes

- b0d11b6: Add `response.status(code)` as a typed alternative to `response[code]`. Allow headers and cookies before status selection, narrowing generated status choices by header names and values while preserving required-header and body validation.

  Deprecate bracket-based `response[statusCode]` selection in favor of `response.status(statusCode)`. Update documentation and generated route stubs to use the function-based selector; existing bracket-based handlers remain supported.

### Patch Changes

- 872e12f: Preserve nullable values, primitive constants, inferred object properties, referenced dictionary values, composition properties and required fields, explicit discriminator mappings, and tuple prefixes in generated TypeScript contracts. Keep unrestricted values typed as unknown and retain Counterfact's streaming and server-oriented binary types.

  Regenerating contracts can expose existing handler type errors where required properties or literal constraints were previously lost.

- Updated dependencies [b0d11b6]
  - @counterfact/types@0.2.0

## 0.1.6

### Patch Changes

- ce0bb3a: Generate TypeScript contracts, route scaffolds, versions, scenarios, middleware, and starter files from AST nodes. Preserve escaped literal names and enum values, and correctly group nested unions within intersections. Resolve context imports before printing and preserve existing route text when inserting new handlers, including function exports, aliases, and multiline imports.

  Unsupported schema type strings produce `unknown` instead of being interpreted as TypeScript identifiers or syntax.

  Keep shared handler exports stable across separate versioned specifications, and add missing runtime handlers alongside existing type-only declarations and re-exports.

- Updated dependencies [865750a]
- Updated dependencies [376ec98]
- Updated dependencies [91428ea]
  - @counterfact/openapi@0.1.6

## 0.1.5

### Patch Changes

- 1714e9a: Classify OpenAPI sources consistently and hot-reload local base documents and overlays without mistaking local `http`-prefixed paths for remote URLs.
- 1145bb3: Updated dependency `prettier` in `@counterfact/generator` to `3.9.9`.
- 6d4af72: Updated dependency `prettier` in `@counterfact/generator` to `3.9.10`.
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

- Updated dependencies [99dab55]
  - @counterfact/openapi@0.1.4

## 0.1.3

### Patch Changes

- 5e4b9eb: Keep every generated repository file contained within its destination directory.
- 28aafab: Reject OpenAPI route paths that cannot be represented safely in generated output.
- Updated dependencies [28aafab]
  - @counterfact/openapi@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [669d9dd]
  - @counterfact/openapi@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [f5e437d]
  - @counterfact/openapi@0.1.1
