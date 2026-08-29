---
name: counterfact-generator-internals
description: >
  Modify TypeScript generator internals, OpenAPI parsing/schema handling, and
  generated file writing behavior without regressing regeneration guarantees.
applyTo:
  - "packages/generator/src/**/*.ts"
  - "packages/generator/test/**/*.test.ts"
---

# Counterfact Generator Internals Skill

## When to use this skill

Use this skill when changing OpenAPI loading/bundling, schema-to-type generation, operation/type coders, repository/script writing, or generated versions typing.

## Files to inspect first

- `packages/generator/README.md`
- `packages/generator/src/README.md`
- `packages/generator/src/code-generator.ts`
- `packages/generator/src/specification.ts`
- `packages/generator/src/requirement.ts`
- `packages/generator/src/repository.ts`
- `packages/generator/src/schema-type-coder.ts`

## Existing conventions to follow

- Keep the generator architecture layered: `Specification/Requirement` -> coders -> `Script` -> `Repository`.
- Preserve regeneration contract: existing route files are not overwritten; generated types are overwritten.
- Support OpenAPI features through typed coders and requirement traversal rather than ad-hoc string logic.
- Keep generated output deterministic and formatted via existing script/repository pipeline.
- Import OpenAPI document behavior through `@counterfact/openapi`; do not move runtime or facade policy into the generator.

## Common mistakes to avoid

- Overwriting user-edited route files in `Repository.writeFiles`.
- Implementing new OpenAPI behavior in only one coder path (missing runtime/type parity).
- Skipping fixture/snapshot updates for changed generated output.
- Breaking group/versioned output conventions (`types/versions.ts` per group).

## How to validate the change

- Run focused generator tests first with `yarn test:generator`; use the affected Jest path while iterating.
- Run: `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`, and `yarn check:boundaries`.
- If behavior changes for generated artifacts, verify snapshots and relevant docs (`packages/counterfact/docs/reference.md`, `packages/counterfact/docs/faq.md`).
