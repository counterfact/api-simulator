---
name: counterfact-generator-internals
description: >
  Modify TypeScript generator internals, OpenAPI parsing/schema handling, and
  generated file writing behavior without regressing regeneration guarantees.
applyTo:
  - "packages/counterfact/src/typescript-generator/**/*.ts"
  - "packages/counterfact/src/server/openapi-document.ts"
  - "packages/counterfact/src/server/load-openapi-document.ts"
  - "packages/counterfact/test/typescript-generator/**/*.test.ts"
---

# Counterfact Generator Internals Skill

## When to use this skill

Use this skill when changing OpenAPI loading/bundling, schema-to-type generation, operation/type coders, repository/script writing, or generated versions typing.

## Files to inspect first

- `packages/counterfact/src/typescript-generator/README.md`
- `packages/counterfact/src/typescript-generator/code-generator.ts`
- `packages/counterfact/src/typescript-generator/specification.ts`
- `packages/counterfact/src/typescript-generator/requirement.ts`
- `packages/counterfact/src/typescript-generator/repository.ts`
- `packages/counterfact/src/typescript-generator/schema-type-coder.ts`

## Existing conventions to follow

- Keep the generator architecture layered: `Specification/Requirement` -> coders -> `Script` -> `Repository`.
- Preserve regeneration contract: existing route files are not overwritten; generated types are overwritten.
- Support OpenAPI features through typed coders and requirement traversal rather than ad-hoc string logic.
- Keep generated output deterministic and formatted via existing script/repository pipeline.

## Common mistakes to avoid

- Overwriting user-edited route files in `Repository.writeFiles`.
- Implementing new OpenAPI behavior in only one coder path (missing runtime/type parity).
- Skipping fixture/snapshot updates for changed generated output.
- Breaking group/versioned output conventions (`types/versions.ts` per group).

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`.
- Run focused generator tests first (affected coder + integration/snapshot tests in `packages/counterfact/test/typescript-generator/`).
- If behavior changes for generated artifacts, verify snapshots and relevant docs (`packages/counterfact/docs/reference.md`, `packages/counterfact/docs/faq.md`).
