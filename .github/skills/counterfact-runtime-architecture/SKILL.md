---
name: counterfact-runtime-architecture
description: >
  Safely change Counterfact runtime/server internals while preserving module
  boundaries, hot reload behavior, and backward compatibility guarantees.
applyTo:
  - "packages/counterfact/src/app.ts"
  - "packages/counterfact/src/api-runner.ts"
  - "packages/runtime/src/**/*.ts"
  - "packages/runtime/src/**/*.cjs"
  - "packages/runtime/test/**/*.test.ts"
  - "packages/counterfact/test/app.test.ts"
---

# Counterfact Runtime Architecture Skill

## When to use this skill

Use this skill when changing runtime orchestration, server dispatch flow, module loading/hot reload, or context/registry behavior.

## Files to inspect first

- `packages/counterfact/src/app.ts`
- `packages/counterfact/src/api-runner.ts`
- `packages/runtime/README.md`
- `packages/runtime/src/server/dispatcher.ts`
- `packages/runtime/src/server/module-loader.ts`
- `packages/runtime/src/server/web-server/create-koa-app.ts`
- `packages/counterfact/docs/reference.md` (architecture + runtime behavior)

## Existing conventions to follow

- Keep product orchestration in the `counterfact` facade's `app.ts` / `ApiRunner`; keep runtime mechanisms in `@counterfact/runtime` and avoid generator dependencies.
- Keep subsystems separated (`registry`, `context-registry`, `module-loader`, `dispatcher`) and connected through explicit constructor interfaces.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads.
- Prefer graceful degradation with actionable errors (see `docs/development/design-principles.md`).

## Common mistakes to avoid

- Coupling generator or facade concerns into `packages/runtime`.
- Deep-importing another workspace instead of using its declared exports.
- Breaking prefix/group/version routing derivation in `app.ts`.
- Introducing restart-only behavior for changes currently handled by watch/reload paths.
- Changing response defaults/content negotiation semantics unintentionally in `dispatcher` or Koa middleware.

## How to validate the change

- Run focused runtime tests first with `yarn test:runtime`; use the affected Jest path while iterating.
- Run: `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`, and `yarn check:boundaries`.
- When facade orchestration changes, include `packages/counterfact/test/app.test.ts` and `packages/counterfact/test/api-runner.test.ts`.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.
