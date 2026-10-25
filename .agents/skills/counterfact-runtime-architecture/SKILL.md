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
- Keep programmatic defaults in `counterfact()` separate from CLI action defaults. Embedding an API needs only `basePath`; generation, watching, and cache building default to enabled regardless of whether a spec is supplied. Explicit options override those defaults, and `start()` merges partial startup overrides into the resolved configuration. Use the effective port for binding, startup scenarios, REPL requests, and status reporting. `watch` flags govern code regeneration, while server startup also enables runtime module/spec/store watching.
- Initialize route and compiled-output directories even when the API is missing or empty; cache creation must not depend on a source file being compiled.
- Resolve HTTP startup only after the listener is ready and reject bind errors through the startup promise. Report listener status from the actual server, including the allocated port when configured with port 0.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads.
- Prefer graceful degradation with actionable errors (see `docs/development/design-principles.md`).
- Versioned runners can share a group and documentation pathname. Select Swagger UI and OpenAPI middleware by version as well as group, preserve unqualified links to the first configured spec, and validate each served contract and Try it out server prefix.
- Select Swagger UI's asset version explicitly: `koa2-swagger-ui` derives its default from its own development dependency, which can lag supported OpenAPI versions. Verify the selected CDN serves every referenced script and stylesheet, then verify actual browser rendering for current OpenAPI versions and legacy Swagger; HTTP 200 on the documentation page and a valid version field do not establish UI compatibility.

## Common mistakes to avoid

- Coupling generator concerns into `packages/runtime/src/server/*` code paths.
- Breaking prefix/group/version routing derivation in `app.ts`.
- Introducing restart-only behavior for changes currently handled by watch/reload paths.
- Changing response defaults/content negotiation semantics unintentionally in `dispatcher` or Koa middleware.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`. The root test command uses the shared Jest configuration across application, runtime, REPL, generator, client, and OpenAPI test roots. Use `yarn test:runtime` or `yarn test:repl` to select those boundaries for focused runs.
- Run focused runtime tests first (for touched areas), e.g. `packages/runtime/test/server/dispatcher.test.ts`, `packages/runtime/test/server/module-loader.test.ts`, `packages/counterfact/test/app.test.ts`.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.
