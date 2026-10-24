# @counterfact/generator

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
