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
  - "packages/runtime/test-native/*.test.mjs"
  - "packages/counterfact/test-native/*.test.mjs"
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

- Keep orchestration in `app.ts` / `ApiRunner`; avoid leaking server details into generator modules.
- Keep subsystems separated (`registry`, `context-registry`, `module-loader`, `dispatcher`) and connected through explicit constructor interfaces.
- Preserve hot-reload expectations: route/module changes should apply without restart and context should survive reloads. Compare reloaded object/array initializers structurally against the cached declaration, not by identity or against live state; otherwise an unchanged initializer can erase scenario seeds, request mutations, or REPL edits. Test both preserved live state and intentional initializer changes. Declaration snapshots must clone native collections with their actual contents/internal slots and retain cycles; prototype-only Map/Set objects cause unchanged declarations to erase live state when the graph reloads.
- Load ESM entries and local static/dynamic dependencies in one generation per explicit load/retry. Watch refreshes reuse unchanged local dependency graphs and invalidate changed files with their transitive importers; unchanged Context constructors must not be reconstructed, so unrelated route edits preserve root arrow receivers and private-field brands. Different simulators may have different constructors; handlers and contexts within each simulator must agree. Keep bare packages and builtins in Node's normal module cache. Do not infer the provenance of Node's canonical module cache by reading current disk contents or reuse failed import promises across generations.
- Versioned runners sharing a context registry also share the generation boundary. Refresh all loaded siblings before reporting completion, preserve live state when another version joins, and retain independent pause handles so reset can pause each runner without deadlock.
- Compare canonical declaration snapshots on both sides of context reloads. Local class prototype identity changes with each ESM generation; retain unchanged nested class state using constructor-source descriptors plus enumerable data, including symbols, decorated native containers and cycles. Keep direct context callbacks and opaque bound functions identity-sensitive. Nested class-owned methods may compare by source, but retained instances do not migrate private fields or closure captures; do not infer hidden initializer values from function source. Test unrelated watched edits and intentional enumerable initializer changes separately.
- Resolve extensionless dotted helper names against source files before rewriting compiled CommonJS imports; a dot in a basename is not proof of an asset extension. Preserve actual non-code imports. Initial source enumeration must follow directory symlinks like the watcher, stop ancestor cycles, and retain distinct alias paths.
- Keep context state construction/reset separate from code generation refresh. Use state-preserving context merges during reloads; objects retained from a previous generation are not automatically converted to new classes. Document that external direct imports need not share simulator class identity.
- Snapshot existing RegExp values with native structured cloning rather than compiling their source/flags properties. Restore the local RegExp prototype for strict comparisons across host/sandbox realms and lastIndex because structured cloning resets it; test nonzero declaration cursors and preserved live mutations.
- Keep programmatic defaults in `counterfact()` separate from CLI action defaults. Embedding an API needs only `basePath`; generation, watching, and cache building default to enabled regardless of whether a spec is supplied. Explicit options override those defaults, and `start()` merges partial startup overrides into the resolved configuration. Use the effective port for binding, startup scenarios, REPL requests, and status reporting. `watch` flags govern code regeneration, while server startup also enables runtime module/spec/store watching.
- Native capability probes must run with real Node resolution: Jest can resolve .js imports to .ts and make a native-TypeScript probe pass when production Node needs the compiled fallback. Exercise explicit .cjs/.cts routes, middleware and local imports through that fallback. Match output filenames and rewritten requires; replace only the final source extension, not .ts in a directory name. Normalize constructor roots and watcher event paths to the same slash convention before prefix replacement.
- Initialize route and compiled-output directories even when the API is missing or empty; cache creation must not depend on a source file being compiled.
- Publish compiled cache files through a unique sibling temporary file and atomic rename. Same-group versioned runners share cache destinations. Windows readers or competing publishers can briefly deny replacement; use bounded retries for sharing errors, keep the existing destination intact, and clean only the failed attempt's temporary file. Never fall back to deleting the destination or writing it in place.
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

- Run: `yarn lint`, `yarn build`, `yarn test`. The root test command builds and runs native module/application integration tests before the shared Jest suite. Use `yarn test:runtime` or `yarn test:repl` to select those boundaries for focused runs.
- Run focused runtime tests first (for touched areas), e.g. `packages/runtime/test/server/dispatcher.test.ts`, `packages/runtime/test-native/module-loader.test.mjs`, `packages/counterfact/test-native/app.test.mjs`.
- Run `yarn workspace @counterfact/runtime test:native:coverage` for the loader/generation boundary, enforcing at least 90% branch coverage. Run real module loading under node:test against built output; Jest sandboxes cannot host Node module hooks. Keep pure registry/dispatch tests in Jest.
- Manually sanity-check startup + runtime flow with `yarn go:example` when behavior changes.

## Recursive request schemas

- Preserve shared schema nodes as references as well as cycles. Identity memoization must survive sibling visits; disable Ajv reference inlining to avoid exponential validator compilation. Verify the public Dispatcher path in a bounded-heap subprocess, with valid and invalid nested bodies.

- OpenAPI dereferencing can produce cyclic JavaScript schema graphs. Convert back edges to JSON Schema references before passing them to Ajv; keep recursive constraints and verify finite valid and invalid nested data.

- Schema cycle references must respect nested $id resource scopes and URI-fragment encoding in addition to JSON Pointer escaping. Preserve boolean schemas before object caching and leave annotations unchanged.

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

- When resolving primitive unions, retain null-only alternatives separately from unresolved schemas. A nested null-only union or null-only type array must not erase the single non-null conversion.

- Do not enable Ajv allErrors for untrusted request bodies. Stop body-error collection early and regression-test large invalid collections; a request byte limit does not bound the number of validation error objects.

- Coerce scalar and array numeric text with the same complete finite decimal parser. Retain integer versus number declarations through dispatch; reject malformed scalar query values before handler entry, and preserve original text when request validation is disabled.

- Normalize array query cardinality and primitive items from the declared schema and serialization style. Do not split commas for default exploded form arrays or invent values for absent optional parameters.

- Query array conversion must retain enclosing union constraints, honor positional prefixItems before trailing items, preserve explicitly exploded occurrences, and reject non-decimal numeric coercion without hiding the original text.

- Read supplied request parameter values using own-property checks; optional parameters named constructor or other prototype keys must remain absent when not supplied.

- Preserve request-body absence at the HTTP parsing boundary. Empty-wire input, explicit {}, and explicit JSON null must remain distinct before optionality and schema validation.
- For versioned dispatch, match the selected contract independently of the shared registry and dispatch the exact selected pattern. Use contract eligibility for shared-prefix runner selection and preserve its Allow header. Operation lookup must ignore inherited properties.

- Detect dynamic-import syntax with the existing TypeScript parser, not a regex over comment-separated tokens: repeated block comments can cause exponential regex backtracking even in tiny valid modules. Test comment-heavy static imports and lazy imports inside template expressions.

- Scope module evaluation and constructor failures to the failed graph rather than invalidating successful sibling contexts. Test syntax/evaluation error recovery without touching context source, and verify caught dynamic-import failures are not mistaken for successful dependency evaluations. Restore a CommonJS watcher’s retained graph before reloading invalid entries; another loader can replace the global require cache between refreshes.
