---
title: "OpenAPI 3.2: Emit @deprecated JSDoc for operations using deprecated security schemes"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 allows security schemes to be marked `deprecated: true`. When a generated handler uses such a scheme, Counterfact should surface this intent to developers as a TypeScript `@deprecated` JSDoc comment, which causes IDEs to show a strikethrough warning.

## Current state

`OperationTypeCoder` in `src/typescript-generator/operation-type-coder.ts` generates handler types for operations but does not inspect the `deprecated` flag on security schemes referenced by an operation.

## Proposed changes

- In `OperationTypeCoder`, check whether any security scheme referenced by an operation has `deprecated: true`
- If so, emit a `/** @deprecated The security scheme '<name>' is deprecated. */` JSDoc comment above the generated handler type

## Acceptance criteria

- [ ] A generated handler for an operation that references a deprecated security scheme includes a `@deprecated` JSDoc comment
- [ ] The generated TypeScript passes `tsc --noEmit` without errors
- [ ] A handler for an operation that uses only non-deprecated security schemes does not include a `@deprecated` comment
- [ ] A unit test covers both the deprecated and non-deprecated cases
