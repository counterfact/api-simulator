---
name: counterfact-runtime-architecture
description: >
  Safely change Counterfact runtime/server internals while preserving module
  boundaries, hot reload behavior, and backward compatibility guarantees.
applyTo:
  - "src/app.ts"
  - "src/api-runner.ts"
  - "src/server/**/*.ts"
  - "src/util/**/*.ts"
  - "test/server/**/*.test.ts"
  - "test/app.test.ts"
---

# Counterfact Runtime Architecture Skill

## When to use this skill

Use this skill when changing runtime orchestration, server dispatch flow, module loading/hot reload, or context/registry behavior.

## Files to inspect first

- `src/app.ts`
- `src/api-runner.ts`
- `src/server/dispatcher.ts`
- `src/server/module-loader.ts`
- `src/server/web-server/create-koa-app.ts`
- `docs/reference.md` (architecture + runtime behavior)

## Existing conventions to follow

- Keep orchestration in `app.ts` / `ApiRunner`; avoid leaking server details into generator modules.
- Keep subsystems separated (`registry`, `context-registry`, `module-loader`, `dispatcher`) and connected through explicit constructor interfaces.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads.
- Prefer graceful degradation with actionable errors (see `docs/development/design-principles.md`).

## Common mistakes to avoid

- Coupling generator concerns into `src/server/*` code paths.
- Breaking prefix/group/version routing derivation in `app.ts`.
- Introducing restart-only behavior for changes currently handled by watch/reload paths.
- Changing response defaults/content negotiation semantics unintentionally in `dispatcher` or Koa middleware.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`.
- Run focused runtime tests first (for touched areas), e.g. `test/server/dispatcher.test.ts`, `test/server/module-loader.test.ts`, `test/app.test.ts`.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.
