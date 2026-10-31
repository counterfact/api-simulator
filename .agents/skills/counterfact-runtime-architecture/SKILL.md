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
- `packages/counterfact/docs/api/simulator.md` (architecture + runtime behavior)

## Existing conventions to follow

- For managed tutorial projects, serve tutorial HTTP through the tutorials-owned native handler before the simulator callback. Do not send controls through route dispatch, validation, proxying, or shop lifecycle gating, and do not add them to the shop spec. Normal APIs and legacy tutorials retain their existing listeners and prefixes.
- Keep orchestration in `app.ts` / `ApiRunner`; avoid leaking server details into generator modules.
- Keep subsystems separated (`registry`, `context-registry`, `module-loader`, `dispatcher`) and connected through explicit constructor interfaces.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads. Compare reloaded object/array initializers structurally against the cached declaration, not by identity or against live state; otherwise an unchanged initializer can erase scenario seeds, request mutations, or REPL edits. Test both preserved live state and intentional initializer changes.
- Keep programmatic defaults in `counterfact()` separate from CLI action defaults. Embedding an API needs only `basePath`; generation, watching, and cache building default to enabled regardless of whether a spec is supplied. Explicit options override those defaults, and `start()` merges partial startup overrides into the resolved configuration. Use the effective port for binding, startup scenarios, REPL requests, and status reporting. `watch` flags govern code regeneration, while server startup also enables runtime module/spec/store watching.
- Initialize route and compiled-output directories even when the API is missing or empty; cache creation must not depend on a source file being compiled.
- Resolve HTTP startup only after the listener is ready and reject bind errors through the startup promise. Report listener status from the actual server, including the allocated port when configured with port 0.
- Distinguish configuration-selected proxying from handler-level `$.proxy(url)`: the former bypasses local dispatch checks, while the latter runs inside dispatch. In the standard HTTP server, pass an explicit operation URL to the helper; do not assume the incoming path/query is appended. Verify forwarding with real HTTP because dispatcher mocks can attach a `req.path` that ordinary Node requests do not provide.
- Prefer graceful degradation with actionable errors (see `docs/development/design-principles.md`).
- Versioned runners can share a group and documentation pathname. Select Swagger UI and OpenAPI middleware by version as well as group, preserve unqualified links to the first configured spec, and validate each served contract and Try it out server prefix.
- Select Swagger UI's asset version explicitly: `koa2-swagger-ui` derives its default from its own development dependency, which can lag supported OpenAPI versions. Verify the selected CDN serves every referenced script and stylesheet, then verify actual browser rendering for current OpenAPI versions and legacy Swagger; HTTP 200 on the documentation page and a valid version field do not establish UI compatibility.

- When terminal output displays an HTTP message, split its head and body at the first `\r\n\r\n` separator only: multipart bodies contain additional separators that must remain visible.

## Common mistakes to avoid

- Coupling generator concerns into `packages/runtime/src/server/*` code paths.
- Breaking prefix/group/version routing derivation in `app.ts`.
- Introducing restart-only behavior for changes currently handled by watch/reload paths.
- Changing response defaults/content negotiation semantics unintentionally in `dispatcher` or Koa middleware.
- Confusing the response factory's `status(code)` selector with the selected response's numeric `status` field. Keep selector changes aligned across generated, middleware, and wide-handler types. Type tests should verify rejected chains as well as successful chains, including headers before selection and explicit responses excluded despite a `default` response.

## How to validate the change

- Run: `yarn lint`, `yarn build`, `yarn test`. The root test command uses the shared Jest configuration across application, runtime, REPL, generator, client, and OpenAPI test roots. Use `yarn test:runtime` or `yarn test:repl` to select those boundaries for focused runs.
- Run focused runtime tests first (for touched areas), e.g. `packages/runtime/test/server/dispatcher.test.ts`, `packages/runtime/test/server/module-loader.test.ts`, `packages/counterfact/test/app.test.ts`.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.

## Explicit reset versus hot reload

- Keep reset reconstruction distinct from hot reload's state-preserving merge.
  Retain loaded constructors/source route definitions; reconstruct stores before
  contexts and resolve context dependencies on demand, detecting cycles.
- Gate new HTTP requests before draining accepted handlers and response streams.
  A disconnected response is not producer completion: await body stream cleanup
  before releasing the barrier. Hold watcher updates during reconstruction and
  startup; keep failed resets
  unavailable until a later reset succeeds. Never close/rebind the listener.
- Track state availability independently from shutdown phase so overlapping stop
  cannot expose pending or failed reconstruction. Resolve scenario builder ports
  from the bound listener, including builders created before ephemeral binding.
- Contexts and stores change identity on reset. Refresh built-in REPL references
  and require consumers to reacquire live objects; registry handles stay stable.
- Share scenario path resolution between programmatic and REPL entrypoints, and
  preserve one startup per group in declaration order across versioned runners.
- Verify lifecycle changes with real HTTP mutation/restoration, same-listener
  checks, async barriers, concurrent calls, failure recovery, and shutdown.
