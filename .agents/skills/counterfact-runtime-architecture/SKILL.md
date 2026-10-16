---
name: counterfact-runtime-architecture
description: >
  Safely change Counterfact runtime/server internals while preserving module
  boundaries, hot reload behavior, and backward compatibility guarantees.
applyTo:
  - "packages/counterfact/src/app.ts"
  - "packages/counterfact/src/api-runner.ts"
  - "packages/runtime/src/server/**/*.ts"
  - "packages/counterfact/src/util/**/*.ts"
  - "packages/runtime/test/server/**/*.test.ts"
  - "packages/counterfact/test/app.test.ts"
  - "packages/repl/src/**/*.ts"
  - "packages/repl/test/**/*.test.ts"
---

# Counterfact Runtime Architecture Skill

## When to use this skill

Use this skill when changing runtime orchestration, server dispatch flow, module loading/hot reload, or context/registry behavior.

## Files to inspect first

- `packages/counterfact/src/app.ts`
- `packages/counterfact/src/api-runner.ts`
- `packages/repl/src/repl.ts`
- `packages/runtime/src/server/dispatcher.ts`
- `packages/runtime/src/server/module-loader.ts`
- `packages/runtime/src/server/web-server/create-koa-app.ts`
- `packages/counterfact/docs/reference.md` (architecture + runtime behavior)

## Existing conventions to follow

- Keep orchestration in `app.ts` / `ApiRunner`; avoid leaking server details into generator modules.
- Keep subsystems separated (`registry`, `context-registry`, `module-loader`, `dispatcher`) and connected through explicit constructor interfaces.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads. Compare reloaded object/array initializers structurally against the cached declaration, not by identity or against live state; otherwise an unchanged initializer can erase scenario seeds, request mutations, or REPL edits. Test both preserved live state and intentional initializer changes.
- Prefer graceful degradation with actionable errors (see `docs/development/design-principles.md`).

## Common mistakes to avoid

- Coupling generator concerns into `packages/runtime/src/server/*` code paths.
- Breaking prefix/group/version routing derivation in `app.ts`.
- Introducing restart-only behavior for changes currently handled by watch/reload paths.
- Changing response defaults/content negotiation semantics unintentionally in `dispatcher` or Koa middleware.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`. The root test command uses the shared Jest configuration across application, runtime, REPL, generator, client, and OpenAPI test roots. Use `yarn test:runtime` or `yarn test:repl` to select those boundaries for focused runs.
- Run focused runtime tests first (for touched areas), e.g. `packages/runtime/test/server/dispatcher.test.ts`, `packages/runtime/test/server/module-loader.test.ts`, `packages/counterfact/test/app.test.ts`.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.
