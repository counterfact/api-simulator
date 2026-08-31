---
name: counterfact-openapi
description: >
  Change standalone OpenAPI loading, bundling, dereferencing, overlays, and
  shared document handling while preserving focused-package boundaries.
applyTo:
  - "packages/openapi/src/**/*.ts"
  - "packages/openapi/test/**/*.test.ts"
  - "packages/runtime/src/server/openapi-document.ts"
  - "packages/runtime/src/server/load-openapi-document.ts"
  - "packages/runtime/src/server/openapi-watcher.ts"
---

# Counterfact OpenAPI Skill

## When to use this skill

Use this skill for OpenAPI file loading, reference resolution, bundling, ordered overlay application, or the runtime adapters that observe documents.

## Files to inspect first

- `packages/openapi/README.md`
- `packages/openapi/src/load-openapi-document.ts`
- `packages/openapi/src/apply-overlay.ts`
- `packages/openapi/test/load-openapi-document.test.ts`
- `packages/openapi/test/apply-overlay.test.ts`

## Existing conventions to follow

- Keep reusable document mechanisms in `@counterfact/openapi`; it does not own CLI telemetry or a long-running product lifecycle.
- Apply overlays in the caller-provided order.
- Use `loadOpenApiDocument` for complete dereferencing and `bundleOpenApiDocument` when internal references must remain.
- Keep runtime watching and reload policy in `@counterfact/runtime`, consuming the OpenAPI package through declared exports.
- Preserve compatibility with both OpenAPI and Swagger inputs supported by the facade.

## Common mistakes to avoid

- Duplicating document loading or overlay logic in the generator, runtime, or facade.
- Deep-importing package source instead of using `@counterfact/openapi` exports.
- Reordering overlays or silently changing dereference versus bundle semantics.
- Adding application lifecycle, telemetry, or server dependencies to the focused OpenAPI package.

## How to validate the change

- Run affected tests under `packages/openapi/test/`, then `yarn test`.
- Run `yarn lint`, `yarn typecheck`, `yarn build`, and `yarn check:boundaries`.
- If facade-visible document behavior changes, run `yarn test:black-box`, update user docs, and add a changeset.
