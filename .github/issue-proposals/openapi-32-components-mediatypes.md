---
title: "OpenAPI 3.2: Verify $ref resolution for components/mediaTypes entries"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 introduces a `mediaTypes` key under `components` to allow reuse of Media Type Objects (similar to how `schemas`, `responses`, `parameters`, and `examples` are reused today). A spec may define a Media Type Object once under `#/components/mediaTypes/...` and reference it via `$ref` from multiple operations.

## Current state

`src/typescript-generator/generate.ts` reads `#/paths` and `#/components/securitySchemes`. Other component types are resolved via `$ref` by the bundler. It is likely that `$ref` values pointing to `#/components/mediaTypes/...` are already handled automatically, but this has not been explicitly tested.

## Proposed changes

- Add a test that uses a spec with a `$ref` pointing to `#/components/mediaTypes/...` and confirms that the bundler resolves it correctly
- Confirm that code generation and runtime routing work correctly for an operation that references a component media type

## Acceptance criteria

- [ ] A spec with `#/components/mediaTypes/...` entries and `$ref` references to them is loaded and bundled without errors
- [ ] Code generation for such a spec produces correct TypeScript output
- [ ] A request to the mock server returns the expected response for an operation that uses a `$ref` media type
- [ ] A regression test covers `$ref` resolution for `components/mediaTypes` entries
