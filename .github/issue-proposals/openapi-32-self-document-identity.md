---
title: "OpenAPI 3.2: Verify correct $ref resolution with $self document identity"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 introduces a top-level `$self` field that allows an OpenAPI document to declare its own canonical URI. This URI is used as the base when resolving relative `$ref` values, which is especially important for multi-file specs.

## Current state

Counterfact uses `@apidevtools/json-schema-ref-parser` for bundling, which already handles base-URI resolution. The `$self` field is likely passed through without issue, but this has not been explicitly verified.

## Proposed changes

- Confirm that the spec loader in `src/typescript-generator/specification.ts` and `src/server/openapi-middleware.ts` does not strip or misinterpret `$self` when bundling
- Add a regression test with a spec that declares `$self` and uses relative `$ref` values to verify that references resolve to the correct schemas

## Acceptance criteria

- [ ] A spec that declares `$self` is loaded and bundled without errors
- [ ] Relative `$ref` values in a spec with `$self` resolve correctly to the intended schemas
- [ ] Code generation for such a spec produces correct TypeScript output
- [ ] A regression test covers `$ref` resolution in a spec that uses `$self`
