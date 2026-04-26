---
title: "OpenAPI 3.2: Handle optional discriminator propertyName gracefully"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

In OpenAPI 3.2, the `discriminator.propertyName` field is now optional. When absent, a `defaultMapping` must be provided instead. Previously, `propertyName` was required, so existing code may assume it is always present.

## Current state

`SchemaTypeCoder.writeGroup()` relies on `allOf`/`anyOf`/`oneOf` without inspecting the `discriminator` object; `propertyName` being absent would not cause an error in the generated union type. However, any code that accesses `discriminator.propertyName` without a null-check could throw at runtime during type generation.

## Proposed changes

- Add a defensive null-check in `src/typescript-generator/schema-type-coder.ts` wherever `discriminator.propertyName` is accessed, so that its absence does not cause a runtime error during code generation

## Acceptance criteria

- [ ] A spec with a discriminator that has no `propertyName` (but has `defaultMapping`) is processed without throwing an error
- [ ] The generated TypeScript for such a spec passes `tsc --noEmit`
- [ ] Existing specs with `propertyName` present continue to generate correct types
- [ ] A unit test covers a discriminator schema with no `propertyName`
