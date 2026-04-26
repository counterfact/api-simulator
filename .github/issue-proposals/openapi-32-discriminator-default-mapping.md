---
title: "OpenAPI 3.2: Use discriminator defaultMapping for more accurate union types"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds a `defaultMapping` field to the Discriminator Object. This field specifies which schema to use when `propertyName` is absent or the discriminator value is not found in the `mapping`. It improves the accuracy of polymorphic schema representations.

## Current state

`SchemaTypeCoder.writeGroup()` in `src/typescript-generator/schema-type-coder.ts` generates union types based on `allOf`/`anyOf`/`oneOf` but does not inspect the `discriminator.defaultMapping` field. As a result, the default variant of a discriminated union may be missing from the generated TypeScript type.

## Proposed changes

- In `SchemaTypeCoder.writeGroup()`, read the `discriminator.defaultMapping` field when present
- Include the default variant schema in the emitted union type so the generated TypeScript accurately represents all possible values

## Acceptance criteria

- [ ] A discriminated schema with `defaultMapping` generates a union type that includes the default variant
- [ ] The generated TypeScript for such a schema passes `tsc --noEmit`
- [ ] A discriminated schema without `defaultMapping` continues to generate the same types as before
- [ ] A unit test covers a discriminator with `defaultMapping` and confirms the correct union type is emitted
