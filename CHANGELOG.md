# counterfact

## 2.12.0

### Minor Changes

- 3502d41: Add native support for the `QUERY` HTTP method (OpenAPI 3.2). The `QUERY` method is safe and idempotent but allows a request body, making it useful for complex search and filter operations.
  - `HttpMethods` in `src/server/registry.ts` now includes `"QUERY"`.
  - The `Module` interface exposes a `QUERY` handler that receives a request body.
  - `HTTP_METHODS` in `src/migrate/update-route-types.ts` now includes `"QUERY"` so the migration helper recognises `HTTP_QUERY` type imports.
  - The MSW integration's `allowedMethods` list now includes `"query"`.
  - The Koa middleware already passes the request body for any method that is not `GET` or `HEAD`, so `QUERY` requests forward their body to the handler automatically.

### Patch Changes

- fda8f18: Add "Multiple API Versions" pattern to docs/patterns/. The new page explains how to configure multiple versioned specs and use `$.minVersion()` to share route handlers across versions without duplication.

  Also rewrites the patterns index introduction: the single long paragraph is now split into labelled sections (Getting started, Organizing state, Runtime control, Versioned and multi-spec APIs, Long-term reliability, Integration strategies) followed by a complete pattern table.

- a6dc7e8: Updated dependency `precinct` to `12.3.1`.
- a71e047: Updated dependency `@apidevtools/json-schema-ref-parser` to `15.3.1`.
- 4224be0: Updated dependency `@swc/core` to `1.15.32`.
- eed59b8: Updated dependency `astro` to `^6.0.0`.
- e88e792: Updated dependency `@jest/globals` to `30.3.0`.
  Updated dependency `@types/debug` to `4.1.12`.
  Updated dependency `@typescript-eslint/eslint-plugin` to `8.58.0`.
  Updated dependency `@typescript-eslint/parser` to `8.58.0`.
  Updated dependency `eslint-plugin-n` to `17.24.0`.
  Updated dependency `eslint-plugin-promise` to `7.2.1`.
  Updated dependency `eslint-plugin-regexp` to `3.0.0`.
  Updated dependency `eslint-plugin-security` to `4.0.0`.
  Updated dependency `posthog-node` to `5.28.11`.
  Updated dependency `tsx` to `4.21.0`.
- ca7c067: Updated dependency `@typescript-eslint/eslint-plugin` to `8.59.1`.
  Updated dependency `@typescript-eslint/parser` to `8.59.1`.
- 68b730f: Updated dependency `json-schema-faker` to `0.6.1`.
- 15b4c1b: Updated dependency `typescript` to `6.0.3`.
- dd4e758: Updated dependency `prettier` to `3.8.3`.
- d8258a9: Updated dependency `eslint-plugin-jest` to `29.15.2`.
- 7a38b14: Updated dependency `@types/debug` to `4.1.13`.
- 47d07e4: Updated dependency `@changesets/cli` to `2.31.0`.
- 6d582b4: Updated dependency `eslint` to `10.3.0`.
- e1bad83: Updated dependency `eslint-plugin-regexp` to `3.1.0`.
- 35abb32: Upgrade `@apidevtools/json-schema-ref-parser` from 15.1.3 to 15.3.5. The new version includes a built-in fix for Windows paths using forward slashes (`C:/...`), making the `patch-package` patch unnecessary.

## 2.11.0

### Minor Changes

- 6c383c9: Admin API is now disabled by default. Use the `--admin-api` flag to opt in.
- a58241f: generator: emit `types/versions.ts` with `Versions`, `VersionsGTE`, and `Versioned` types

  When at least one `SpecConfig` entry has a non-empty `version` field, the code generator now writes `types/versions.ts` to the `basePath` root. The file exports:
  - `Versions` — a union of all distinct version strings in config-declaration order
  - `VersionsGTE` — a map from each version to the set of versions that are >= it
  - `Versioned<T, V>` — a utility type that narrows the `$` argument of a route handler to a specific API version

  `Versioned` is also exported from `counterfact-types/index.ts` in its generic form (with explicit `TVersions` and `TVersionsGTE` type parameters) for use outside of the generated file.

  No file is written when no spec defines a `version`.

- 4bb9493: Add runtime implementation of `$.minVersion()` for versioned route handlers.

  When multiple versioned specs share the same API group, each request's `$`
  argument now includes:
  - `version` — a string identifying which version is handling the request
    (e.g. `"v1"`, `"v2"`).
  - `minVersion(min)` — a method that returns `true` when the current version
    is greater than or equal to `min` in the declared version order, and
    `false` otherwise.

  The version order is determined by the position of each spec in the `specs`
  array passed to `counterfact()` (first entry = oldest version).

  For unversioned runners (`version` is not set), neither `version` nor
  `minVersion` is present on `$`.

- af44d5b: `OperationTypeCoder` now emits version-mapped handler types for multi-version APIs.

  When two or more versioned specs share the same operation path, the shared
  `types/paths/<path>.types.ts` file exports a merged `HTTP_<METHOD>` type
  whose `$` argument is `Versioned<{ v1: …; v2: … }>` (a union of each
  version's strongly-typed argument object). Each version's `$`-argument type
  is emitted to `types/<version>/paths/<path>.types.ts` and imported by the
  shared file.

  Single-spec (unversioned) output is unchanged for full backwards compatibility.

  A new `Versioned<T>` utility type is exported from `counterfact-types/index.js`.

- 142bcdd: When a `SpecConfig` entry declares both `group` and `version`, the server now automatically mounts that spec's routes under `/<group>/<version>` without requiring an explicit `prefix`.

  The derivation rules are:

  | `prefix` provided? | `group` set? | `version` set? | Derived prefix          |
  | ------------------ | ------------ | -------------- | ----------------------- |
  | Yes                | any          | any            | use the explicit prefix |
  | No                 | Yes          | Yes            | `/<group>/<version>`    |
  | No                 | Yes          | No             | `/<group>`              |
  | No                 | No           | No             | `""` (root)             |

  Two specs with the same `group` but different `version` values can coexist on a single server instance — validation now checks uniqueness on the `(group, version)` pair instead of `group` alone.

  **Migration note:** `SpecConfig.prefix` is now an optional field (`prefix?: string`). Specs that omit `prefix` will have it derived automatically; pass an explicit `prefix: ""` to force the root prefix.

### Patch Changes

- 825b65d: Cast parameters at runtime: parameters defined with OAS3-style schema types (e.g. `schema: { type: "integer" }`) are now correctly cast to their declared JavaScript types in route handlers. For example, when `GET /pet/1` is called, `$.path.petId` will be a number rather than a string when the OpenAPI spec declares it as `integer`.
- 161deca: Fix documentation inconsistencies: complete CLI reference table, correct programmatic API example in FAQ, fix invalid JS syntax and broken link in without-openapi guide, and fix formatting in programmatic-api guide.
- 6d19132: Fix TypeScript error caused by combining a mapped type and explicit properties in the same generated response object type.

  When an OpenAPI spec defines a `default` response alongside explicit status codes (e.g. `200`, `400`), the generated `ResponseBuilderFactory` type argument now uses an intersection (`{ 200: ..., 400: ... } & { [statusCode in Exclude<HttpStatusCode, 200 | 400>]: ... }`) instead of mixing both in a single object literal, which TypeScript does not allow.

- ee38734: Fix: parameters defined at the path item level in an OpenAPI spec are now included in generated TypeScript types.

  Previously, parameters declared under a path item (e.g. `/stuff/{stuffId}: parameters: [...]`) were ignored during type generation, causing the route handler's `path` (and other) argument types to be `never`. Now those path-item-level parameters are merged with any operation-level parameters (operation-level takes precedence when both declare the same name and location), producing the correct strongly-typed handler signatures.

- 3e0fbc1: Telemetry is now always enabled (removed the pre-May-2026 date gate)
- bce607e: Update usage link in REPL and CLI banner to point to the new GitHub docs URL.
- dd4abb8: Generated `$`-arg types now include a `version` property. For versioned specs the property is a string literal (e.g. `version: "v3"`); for unversioned specs it is `never` (omitted at runtime by `OmitValueWhenNever`).

## 2.10.0

### Minor Changes

- 43b0e34: The type system no longer allows responses constructed without $.response

### Patch Changes

- 68b2c8f: Fix: query parameters of type object with exploded form style (the OpenAPI default) are now properly supported. The request validator no longer falsely reports required object parameters as missing when their properties are sent as individual query params (e.g. `?page=0&size=100`). The handler receives the object assembled under the parameter name (`$.query.pageable`) rather than only the flat individual keys.

## 2.9.0

### Minor Changes

- ffc7d53: Add `ApiRunner` class in `src/api-runner.ts` that encapsulates the creation and lifecycle management of all Counterfact sub-systems (Registry, ContextRegistry, ScenarioRegistry, ScenarioFileGenerator, CodeGenerator, Dispatcher, Transpiler, ModuleLoader, and OpenApiDocument) for a single API specification.

  Each sub-system is exposed as a public property. The class provides four composite methods — `generate()`, `load()`, `watch()`, and `stopWatching()` — that coordinate across multiple sub-systems based on the supplied configuration. Use the static async `ApiRunner.create(config)` factory method to construct an instance.

  `counterfact()` in `app.ts` now uses `ApiRunner` internally.

- a6bb5bc: Add support for multiple API specifications via `ApiRunner`.
  - `ApiRunner.create(config, group?)` now accepts an optional `group` string (default `""`) that places generated code in a subdirectory of `config.basePath`.
  - `ApiRunner` exposes `group` as a public readonly property and `subdirectory` as a computed getter (returns `""` when group is empty, or `"/${group}"`).
  - `CodeGenerator` receives `config.basePath + runner.subdirectory` so each spec's generated files land in the right subdirectory.
  - `createKoaApp` now accepts `runners: ApiRunner[]` (an array) instead of a single `runner`. It loops over all runners to mount per-spec OpenAPI document, Swagger UI, Admin API, and route-dispatching middleware.
  - `counterfact()` accepts an optional `specs: SpecConfig[]` second argument (each entry has `source`, `prefix`, and `group`). When omitted, a single spec is derived from `config.openApiPath` and `config.prefix` for full backward compatibility. The REPL is configured using the first spec's runner.
  - The `spec` key in `counterfact.yaml` can now be a single `{source, prefix, group}` object or an array of such objects to configure multiple APIs from the config file.

- 26e00eb: Add `openApiPath` and `prefix` as public readonly properties on `ApiRunner`.

  Refactor `createKoaApp` to accept `runner: ApiRunner` (providing the dispatcher, registry, context registry, OpenAPI path, and route prefix) instead of a `config: Config` monolith plus separate sub-system refs. All other config fields used by `createKoaApp` are now explicit named arguments, laying the groundwork for passing multiple runners to `createKoaApp` in the future.

### Patch Changes

- aa23b79: Support `.scenario <group> <path>` in multi-API REPL sessions while preserving single-runner syntax.
- d0dff90: Warn and skip loading context modules when they fail to import, including syntax errors in \_.context files.
- 75938e3: Prefer OpenAPI route paths for REPL tab completion and refactor completer lookups into focused helpers.
- 7a8c0b6: Move MSW (Mock Service Worker) code out of `app.ts` into a dedicated `src/msw.ts` module. The `MockRequest` type, `handleMswRequest`, and `createMswHandlers` are still re-exported from `app.ts` for backward compatibility. Tests for these functions have been moved to `test/msw.test.ts`.
- 4894f18: Organized Koa middleware into a dedicated `src/server/web-server/` directory. Each middleware constructor now takes its path prefix as the first argument, making `createKoaApp` easier to read at a glance. `openapiMiddleware` simplified to handle a single path only.
- 3aa8416: Expose grouped REPL context and routes for multi-API runners, and require non-empty unique group names when configuring multiple APIs.
- b270516: Move CLI logic from bin/counterfact.js into src/cli/ as TypeScript modules
- a3d16ab: Update REPL `.scenario` tab completion to suggest groups first in multi-API mode and group-scoped scenarios after selection.

## 2.8.1

### Patch Changes

- 0b32088: Use `Pick<Config, ...>` in function signatures to declare only the config keys each function actually uses. This improves readability and makes each function's dependencies explicit.

## 2.8.0

### Minor Changes

- c6e0625: Add startup scenario: export a function named `startup` from `scenarios/index.ts` and it will run automatically when the server initializes, right before the REPL starts. Use it to seed dummy data so the server is immediately useful without any manual REPL commands. If `startup` is not exported, the server starts normally with no error.
- a0cbfcc: `createKoaApp()` now accepts named parameters via destructuring (`{ config, dispatcher, registry, contextRegistry }`) and creates `routesMiddleware` and `adminApiMiddleware` internally. `counterfact()` no longer returns `routesMiddleware`.
- ae11a87: Refactor `OpenApiDocument` from a plain interface into a class.

  `OpenApiDocument` now extends `EventTarget` and manages its own lifecycle:
  - `new OpenApiDocument(source)` — create an instance pointing at a local path or URL
  - `await document.load()` — read and parse the file, populating `paths`, `basePath`, and `produces`
  - `await document.watch()` — start watching the source file; dispatches a `"reload"` event whenever the file changes on disk
  - `await document.stopWatching()` — stop the file watcher

  The separate `OpenApiWatcher` class has been removed; its behaviour is now built into `OpenApiDocument`.

- 687f8fc: Remove the built-in GUI client (dashboard and RapiDoc pages) from src/client and the Handlebars dependency. The Swagger UI at /counterfact/swagger remains available. Navigating to /counterfact now redirects to /counterfact/swagger.
- 55ee5e2: Export `ContextArgs` type from generated `types/_.context.ts` so that `_.context.ts` files can strongly type the `loadContext` and `readJson` parameters received in the Context constructor. The default `_.context.ts` template now imports and uses `ContextArgs`.

### Patch Changes

- 145c7f4: Add `toForwardSlashPath` utility function and `ForwardSlashPath` branded type. All path normalization that previously used inline `.replaceAll("\\", "/")` now goes through this single, centralized function, making Windows path handling easier to find and reason about.
- e0414c7: Add JSDoc comments throughout the codebase, covering all major classes, functions, and interfaces in `src/server/`, `src/typescript-generator/`, `src/repl/`, and `src/util/`.
- ea5b3e9: Make the hexagon in the REPL prompt the same shade of blue as the logo (#0071b5).
- c047a4d: Refactor: extract a `ScenarioFileGenerator` class that encapsulates `writeScenarioContextType` and `writeDefaultScenariosIndex`, complete with its own file-system watcher for the `routes/` directory. `app.ts` now calls `ScenarioFileGenerator` directly instead of hooking into `contextRegistry` events.
- 919fd3c: Fix Jest worker process failing to exit gracefully by closing REPL servers after each test in the repl test suite.
- 688fb84: Fix TypeError when an OpenAPI Path Item Object contains non-HTTP-verb fields such as `summary`, `description`, `servers`, or `parameters`. These fields are now correctly ignored during code generation instead of being treated as operations.
- ca38a27: Moved `openapi-example.yaml` from the repository root into `test/fixtures/openapi-example.yaml` and expanded it with many OpenAPI edge cases: CRUD operations on `/users` and `/users/{userId}`, polymorphic events via `oneOf`/`allOf`/`discriminator`, nullable fields, enum types, integer formats, file upload via `multipart/form-data`, cookie parameters, deprecated endpoints, multiple response content types, a no-body `204` health-check endpoint, and free-form `additionalProperties` objects.
- 8834b1d: Refactor `createKoaApp()` to accept `adminApiMiddleware` as a parameter instead of constructing it internally. Rename the `koaMiddleware` parameter and export to `routesMiddleware`.
- 51e3cb1: Refactor docs information architecture: `docs/usage.md` is now a central hub page linking to individual feature pages under `docs/features/`, and pattern pages are consolidated under `docs/patterns/index.md`.
- f97e8a7: Refactor `openapiMiddleware` to accept an array of `{ path, baseUrl, id }` document descriptors. When the array contains a single entry the document is still served at `/counterfact/openapi` (backward-compatible). When multiple entries are provided each document is served at `/counterfact/openapi/{id}`.
- b26617e: Replaced the five-minute walkthrough README with a concise, confident two-paragraph introduction. Added ten README variants under `docs/readme-variants/` for the team to review and choose from.
- e4e8757: Rename the `.apply` REPL command to `.scenario`. Update all references in code, tests, and documentation.

## 2.7.0

### Minor Changes

- 0043b20: Add support for a `counterfact.yaml` config file. All CLI options can now be specified in a `counterfact.yaml` file in the current working directory. Command-line options always take precedence over config file settings. Use `--config <path>` to load a config file from a non-default location.
- 2cbd0d5: Add .empty() method to response builder for responses with no body
- 965dc4e: Add `.apply` REPL dot-command (Approach 1: Minimalist Function Injection).

  The `.apply` command lets you run scenario scripts from the REPL prompt without leaving the terminal. A scenario is a plain TypeScript (or JavaScript) file that exports named functions. Each function receives an `ApplyContext` object with `{ context, loadContext, routes, route }` and can freely read or mutate state.

  **Path resolution:**

  | Command              | File                   | Function |
  | -------------------- | ---------------------- | -------- |
  | `.apply foo`         | `scenarios/index.ts`   | `foo`    |
  | `.apply foo/bar`     | `scenarios/foo.ts`     | `bar`    |
  | `.apply foo/bar/baz` | `scenarios/foo/bar.ts` | `baz`    |

  The `ApplyContext` type is written to `types/apply-context.ts` during code generation.

- a356bdf: Validate response headers at runtime and report type errors as `response-type-error` HTTP headers (one per error, multiple headers with the same name). Use --no-validate-response to disable.

### Patch Changes

- 54b866c: add docs/usage-patterns.md documenting seven usage patterns: explore a new API, simulate failures and edge cases, mock APIs with dummy data, fast sandbox for agentic coding, hybrid proxy, API reference implementation, and executable spec
- 6e0655b: fix type error when returning a response with no body (e.g. `$.response[200]` or `$.response[404]` in routes where the spec defines no response body)
- 754dbbd: add two new usage pattern docs: Automated Integration Tests (programmatic API in test suites) and Custom Middleware (\_.middleware.ts for cross-cutting concerns); propose three future patterns as GitHub issues: Record and Replay, Webhook Simulation, and Persistent State
- f9a9790: Refactor `src/counterfact-types/` so that each type lives in its own file with a JSDoc comment explaining its purpose. The `index.ts` now re-exports all types from the individual files. This is an internal refactor with no change to the public API.
- 6d50ae6: Updated dependency `ajv` to `8.18.0`.
- fa25ec3: Updated dependency `@swc/core` to `1.15.24`.
- cbab929: Updated dependency `eslint` to `10.2.0`.
- 9c5fc1d: Replace deprecated `unescape()` with `decodeURIComponent()` wrapped in a try/catch in `requirement.ts`. This avoids use of the deprecated global function while preserving the behavior of returning invalid percent-encoded sequences unchanged.
- 323cf1c: Revised documentation for coherence: added table of contents to usage, reference, and FAQ pages; added "See also" sections to pages that were missing them; moved the usage guide link from the README footer into the "Go deeper" table.

## 2.6.0

### Minor Changes

- 3b0334a: Add JSDoc comment generation for types from OpenAPI metadata

  Generated TypeScript types now include inline JSDoc comments derived from the OpenAPI spec:
  - Schema-level JSDoc from `description`/`summary`
  - Property-level JSDoc including `description`, `@example`, `@default`, `@format`, and `@deprecated`
  - Operation-level JSDoc from operation `summary`/`description`

  This improves IDE hover documentation and AI-assisted development workflows.

- a3b24f0: Add request validation against the OpenAPI spec. Incoming requests are now validated by default — missing required query parameters, missing required headers, and request bodies that do not match the declared schema all result in a 400 response with a descriptive error message. Validation can be disabled with the `--no-validate-request` CLI flag.
- 3c5c284: Add lightweight telemetry using PostHog to track usage of Counterfact. Fires a single `counterfact_started` event on startup. Telemetry is disabled by default before May 1, 2026, disabled in CI, and can be controlled with the `COUNTERFACT_TELEMETRY_DISABLED` environment variable. A one-time warning is shown before the rollout date.
- 6c9e30f: Add REPL-native request builder (`route()`) with fluent API, OpenAPI introspection, and autocomplete support.

  The new `route()` function is available in the REPL and allows users to discover, construct, and execute API requests interactively:

  ```js
  const pet = route("/pet/{petId}").method("get").path({ petId: 1 });

  await pet.send();
  ```

  Key capabilities:
  - Fluent, immutable builder API (`.method()`, `.path()`, `.query()`, `.headers()`, `.body()`)
  - OpenAPI-backed introspection via `.help()`, `.ready()`, and `.missing()`
  - Actionable feedback when required parameters are absent
  - Custom REPL display showing parameter status
  - Autocomplete for `route("` in addition to existing `client.*` patterns

### Patch Changes

- 7a89d27: Refactor internal plain objects to Maps where appropriate:
  - `Directory.directories` and `Directory.files` in `module-tree.ts` are now `Map<string, Directory>` and `Map<string, File>`
  - `ParameterTypes` inner types in `dispatcher.ts` are now `Map<string, string>`
  - `castParameters` in `registry.ts` now accepts `Map<string, string>` for parameter types
- 5b7d8b3: Improve error messages for malformed or missing OpenAPI specs. Instead of showing a JavaScript stack trace, Counterfact now displays a clear, actionable message that includes the spec path and the underlying reason for the failure.
- ff2ba80: Auto-detect TypeScript native runtime support (tsx, ts-node, node --experimental-strip-types) instead of requiring a --use-tsx flag

## 2.5.1

### Patch Changes

- a10ac3d: Convert remaining JavaScript source files and tests to TypeScript with proper types

## 2.5.0

### Minor Changes

- f440a20: Display the current version on startup and warn when a newer version is available on npm. The version check runs non-blocking in the background after the server starts, and can be suppressed with `--no-update-check` or by setting the `CI` environment variable.

### Patch Changes

- cdb4c42: Fix import path in generated route handler files when the OpenAPI path contains a colon (e.g. `/stuff:action`). Previously, the import statement used a literal `:` but the type file was written to disk with the Unicode ratio symbol `∶` (U+2236), causing TypeScript to fail to resolve the type and fall back to `any`.
- eb65932: Fix `Access-Control-Allow-Methods` CORS header to reflect only the HTTP methods actually implemented by the route handler, instead of hardcoding `GET,HEAD,PUT,POST,DELETE,PATCH` for every route.
- d522f6f: Fix crash when a route file is deleted while the server is running. Previously, the file-watch handler would attempt to re-import the deleted file after removing it from the registry, causing a `TypeError`. Now the handler returns immediately after processing the `unlink` event.
- d306720: Fix crash when a route file has a syntax error. Previously, Counterfact would crash with an unhandled promise rejection when a CommonJS route file had a syntax error. Now the server stays running and requests to that route return a 500 response with a message indicating which file has the error.
- 6ca6998: Fix request body parsing: `RawHttpClient` now automatically sets `Content-Type: application/json` when the body is an object, so `$.body` is populated correctly in route handlers.
- df8abcf: Fix TypeError when a response content entry has no schema defined. Previously, the TypeScript type generator would crash with `TypeError: Cannot read properties of undefined (reading 'data')` and emit an empty error comment type. Now it gracefully falls back to `unknown` for the body type.
- 37dec24: Updated dependency `koa` to `3.2.0`.
- a1973c7: Updated dependency `lodash` to `4.18.1`.

## 2.4.0

### Minor Changes

- cb931d6: When multiple wildcard route handlers exist at the same path level (e.g. `/{x}` and `/{y}` as siblings), Counterfact now:
  1. Logs an error to stderr at load time listing the conflicting wildcard names.
  2. Returns an HTTP 500 response when a request could be routed to two or more handlers due to the ambiguity.

- 0a3039b: Add support for binary data in responses. Route handlers can now return binary content using the new `binary()` method on the response builder, which accepts a `Buffer` or a base64-encoded string. OpenAPI schemas with `format: "binary"` (v3) or `type: "file"` (v2) now generate `Buffer | string` TypeScript types.
- d53f4c3: Break REPL out of `counterfact()` and expose it as a callable `startRepl()` on the returned object. This enables programmatic usage (e.g. from Playwright tests) without automatically starting an interactive terminal session.

  ```ts
  import { counterfact } from "counterfact";

  const { contextRegistry, start, startRepl } = await counterfact(config);
  await start(config);

  // Manipulate server state directly from test code:
  const rootContext = contextRegistry.find("/");
  rootContext.passwordResponse = "expired";
  ```

  The CLI (`bin/counterfact.js`) now explicitly calls `startRepl()` when `--repl` is passed, preserving existing behaviour.

- 861c4db: Add route autocomplete to REPL for `client.<method>("...")` patterns.

  When typing `client.get("/p` in the REPL and pressing Tab, the REPL now suggests available routes (e.g. `/pets`, `/pets/{petId}`) derived from the route registry.

  This works for all HTTP methods: `get`, `post`, `put`, `patch`, and `delete`.

- 1e4d5cf: Add chainable `$.response.cookie()` helper for setting response cookies.

  Route handlers can now set one or more cookies without manually building `Set-Cookie` header strings:

  ```ts
  return $.response[200]
    .cookie("sessionId", "abc123", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    })
    .cookie("theme", "dark")
    .json({ ok: true });
  ```

  Supported options: `path`, `domain`, `maxAge`, `expires`, `httpOnly`, `secure`, `sameSite`.

### Patch Changes

- 578faab: Fix REPL tab completion for built-in Node.js completions (e.g. `context.<Tab>`).

  The custom route completer previously replaced Node's built-in REPL completer entirely, breaking property completion for objects like `context` and `client`. The completer now delegates to the built-in completer when the input doesn't match the `client.<method>("...")` pattern.

- 76d3103: Updated dependency `json-schema-faker` to `0.6.0`.
- 4229034: Updated dependency `eslint` to `10.0.3`.
- 635071c: Updated dependency `eslint-plugin-jest` to `29.15.1`.
- ff36c53: Updated dependency `handlebars` to `4.7.9`.
- 9e2b147: Updated dependency `typescript` to `6.0.2`.
- 7f9ce73: Updated dependency `@swc/core` to `1.15.21`.
- a7a56a2: Updated dependency `eslint` to `10.1.0`.

## 2.3.0

### Minor Changes

- 2fc3033: Added `--prune` option to remove route files that no longer exist in the OpenAPI spec.

  When an OpenAPI spec renames a path parameter (e.g. `/pet/{id}/update/{Name}` → `/pet/{id}/update/{nickname}`), running without `--prune` leaves the old file in place alongside the newly generated one, causing wildcard ambiguity in route matching. The new flag cleans up defunct route files before generation runs.

  ```sh
  npx counterfact openapi.yaml ./out --generate --prune
  ```

  Context files (`_.context.ts`) and empty directories are handled correctly — context files are never pruned, and any directories left empty after pruning are removed automatically.

### Patch Changes

- eb72148: Add --spec flag as alternative to positional OpenAPI argument
- 79b4936: fixed a regression causing all 200 responses to be just "ok"
- 9a8dc4a: Add utility function for loading JSON files
- 86c4460: Updated dependency `@types/koa` to `3.0.2`.
- 1d08f75: Fill in required response headers in `random()`. When an OpenAPI response definition marks a header as `required: true`, the `random()` function now automatically generates a value for that header using the header's schema. Headers that are already set are not overwritten.

## 2.2.1

### Patch Changes

- 304cbfe: Add `example(name)` method to response builder for selecting named OpenAPI examples

  Developers can now select a specific named example from the OpenAPI specification using the strongly-typed `example()` method on a response builder:

  ```ts
  return $.response[200].example("namedExample1");
  ```

  The method is fully type-safe: TypeScript will autocomplete the example names defined in the OpenAPI document and report a type error if an unknown name is used.

  Example names are collected from the `examples` field of each media type in the response content (OpenAPI 3.x). The method can be chained with other response builder methods:

  ```ts
  return $.response[200]
    .example("namedExample1")
    .header("some-header", "some-value");
  ```

## 2.2.0

### Minor Changes

- 008f133: Admin API and Agent Skill
- 23b219b: format JSON in HTTP responses for readability

### Patch Changes

- c92f975: Fixed Midleware matching all routes is not executed #1515
- 86f1de2: Return HTTP 405 (Method Not Allowed) with an `Allow` header when the requested path is registered but the HTTP method has no handler. Previously these requests returned 404, making it impossible to distinguish "path not found" from "method not allowed".

## 2.1.0

### Minor Changes

- ca69418: adds a notice linking to important discussion: https://github.com/pmcelhaney/counterfact/discussions/1527

## 2.0.1

### Patch Changes

- 3a7046b: Sanitize `operationId` values before using them as TypeScript identifiers in generated code.

  Previously, any `operationId` from an OpenAPI spec was used verbatim, which could produce invalid TypeScript when the value contained hyphens, dots, spaces, or other characters not permitted in identifiers. The value is now converted to camelCase (e.g. `get-user-profile` → `getUserProfile`) and any remaining invalid characters are stripped.

## 2.0.0

### Major Changes

- 56ddbfe: BREAKING: Updates route types to use operationId for more explicit route types and operation types.
  Why: Presently the routes generated from the OpenApi specification all use the same exported type of HTTP*{method} such as HTTP_GET and HTTP_POST. When you open those types, the path parameters, query parameters and headers are just inline types in the parent exported class. Some of our users desired the inline types to be explicit so that they can use the generated query types in other places. Our first change was just to add explicit types to the query parameters, but in working through the change it made more sense to go ahead and also add types for the path parameters and headers. Then since those new types will attempt to use the operationId from the spec if it is available, it made sense to make the entire route type more unique to that operationId instead of all the routes using HTTP_GET, HTTP_POST, HTTP_DELETE, etc.
  What you need to do: On launch Counterfact will run a migration script to migrate all your existing routes to the new types. You will need to pay attention to the output after your first run to be sure the upgrade was correct. In the unlikely event that an end user has other places in their code where they directly reference the HTTP* types those will need to be manually updated.

### Patch Changes

- e82c2ce: Fix incorrect required property type generation in schema-type-coder

## 1.6.0

### Minor Changes

- 70b2855: Added explicit parameter type exports for query parameters, path parameters, and headers. Operation types now export separate named types (e.g., `findPetsByStatus_Query`, `getPetById_Path`, `authenticate_Headers`) when parameters exist and use the operationId from your OpenAPI specification. These types can be imported and reused elsewhere in your code. The main operation types (HTTP_GET, HTTP_POST, etc.) remain unchanged for backward compatibility.

  Example:

  ```typescript
  import type {
    HTTP_GET,
    findPetsByStatus_Query,
  } from "./types/paths/pet.types.ts";

  // Use the query type elsewhere
  function validateQuery(query: findPetsByStatus_Query) {
    // ...
  }
  ```

## 1.5.0

### Minor Changes

- 5b52a18: make operation methods like GET() and POST() async
- da0c55e: Add a $.delay() utility for simulating slow responses (#720)
- 8349ae6: add a client object to the REPL for quickly sending HTTP requests

## 1.4.9

### Patch Changes

- df64c5a: feat: Speed up by using regex replace instead of recast (thanks [jrunning](https://github.com/jrunning)!)
- c4e0c23: revert change in #1372 which broke type shortcuts like .json(), .html(), etc.

## 1.4.8

### Patch Changes

- e06b36a: Security update for js-yaml

## 1.4.7

### Patch Changes

- 56e0c54: better description in package.json

## 1.4.6

### Patch Changes

- 6d25133: fix an issue with proxy where headers are mangled

## 1.4.5

### Patch Changes

- 8f0d2d2: fix for Windows when a path contains a colon (:), resolves #1381

## 1.4.4

### Patch Changes

- f760bec: fix an issue where proxying to an HTTPS target does not work

## 1.4.3

### Patch Changes

- e8e6e6d: fix error with $.proxy() when making a GET request

## 1.4.2

### Patch Changes

- df23b2e: MaybeShortcut for content type is too strict #1370 -- thanks @ihor-rud!

## 1.4.1

### Patch Changes

- 12f22fd: Add buildCache CLI option

## 1.4.0

### Minor Changes

- d2f02bb: Add Mock Service Worker handler capability

### Patch Changes

- 9cde046: fix to buildMatch in module-tree

## 1.3.0

### Minor Changes

- b69d508: added extensibility via middleware

## 1.2.0

### Minor Changes

- 800d03c: Add alwaysFakeOptionals option

## 1.1.7

### Patch Changes

- 813ecec: follow $refs in parameters (fixes #1105)
- 3b4c9ea: work-around for URL-encoding in path names (#1083)

## 1.1.6

### Patch Changes

- af31a7c: fix types: $.header should be $.headers (#1160)

## 1.1.5

### Patch Changes

- 0a9df8f: also cast numbers (non-integers) and booleans to the right types at runtime
- 2d229c6: correct runtime type of parameters for Swagger v2 (fixes #1116)

## 1.1.4

### Patch Changes

- 06bf54d: fixed an issue where $refs were not followed (#1089)

## 1.1.3

### Patch Changes

- 707a0ec: Updates JSONSchemaFaker to have the fillProperties option false so it will not make up fake object properties

## 1.1.2

### Patch Changes

- b5578b5: fix vscode:// links on Windows (#1058)

## 1.1.1

### Patch Changes

- 1af9ec9: Fixes logic in module-tree when a path has multiple wildcard children at the same position

## 1.1.0

### Minor Changes

- c586ab8: minor change to REPL: if no action-related argument is passed (--generate, --watch, --serve, --repl), do all of the actions
- e4e1009: If a path is defined at the root (/) it's mapped to index.ts

## 1.0.2

### Patch Changes

- 2748fa2: fix: request body type is not found in OpenAPI 2 when consumes is in the root

## 1.0.1

### Patch Changes

- fcc9682: support arrays in JSON schema type property ([#1005](https://github.com/pmcelhaney/counterfact/issues/1005))

## 1.0.0

### Major Changes

- e2f8ac8: Version 1.0!

### Patch Changes

- e2f8ac8: replaced koa-proxy with koa-proxies to get rid of a deprecation warning (as it turns out, koa-proxies had a different deprecation, but I was able to fix it with patch-package; unfortunately none of the alternatives seem to be currently maintained)

## 0.46.0

### Minor Changes

- 48a0c78: ability at runtime for a context object to access other context objects
- c45fcba: New logo! It's not perfect, but the best I can do by myself. If you have graphic design skills, I could use some help cleaning it up.

## 0.45.2

### Patch Changes

- 33ccdbf: Update context-registry find logic for bug with mixed path casing

## 0.45.1

### Patch Changes

- 4339e42: Fix paths to routes migration

## 0.45.0

### Minor Changes

- 0bcf083: fix argument type for .json() (third time's a charm?)

## 0.44.0

### Minor Changes

- 11518ab: **New file structure** - In preparation for the 1.0 release, `paths` has moved to `routes`; `path-types` and `components` are now under `types`. Counterfact will automatically migrate your code for you. We don't like making disruptive changes like this; this will be the last one for the foreseeable future.

## 0.43.2

### Patch Changes

- b09fb59: fixed the type system to address that fact that json() handles multiple content types

## 0.43.1

### Patch Changes

- 9e285a5: reverted type change for .json() -- it had unintended consequences

## 0.43.0

### Minor Changes

- 425e893: turn the proxy on or off for individual paths
- 4fed190: expand the .json() shortcut to include variations of JSON and XML content types

## 0.42.1

### Patch Changes

- 88adb61: fixes an issue where imports without a file extension were not transpiled properly

## 0.42.0

### Minor Changes

- e355b66: Add command line options for granular control of the different parts of CF

## 0.41.1

### Patch Changes

- ab15645: fix #898 hot reloading broken due to cache issues

## 0.41.0

### Minor Changes

- 46bd016: option to run Counterfact without OpenAPI (#834)

### Patch Changes

- 1f44f3d: fixed #721: .proxy on / .proxy off commands in REPL have no effect

## 0.40.2

### Patch Changes

- b731a44: fix invalid TypeScript generated for recursive types

## 0.40.1

### Patch Changes

- a5a728a: delete the .cache directory at startup so old leftover files don't make trouble

## 0.40.0

### Minor Changes

- 678c51b: when a file is changed, all files on which it depends are hot-reloaded (fixes [#835](https://github.com/pmcelhaney/counterfact/issues/835))
- bb0a11c: performance fix that should significantly reduce startup time

### Patch Changes

- 5503a8e: a lot of refactoring of the code that loads modules
- ef57997: fixed: make --prefix work with Swagger

## 0.39.1

### Patch Changes

- cb1e12b: move patch-package to dependencies so it won't mess up install

## 0.39.0

### Minor Changes

- 1f7bfb9: support for basic auth ($.auth.username and $.auth.password)

### Patch Changes

- d0f6f5a: Updates dispatcher class to ignore case when matching paths
- c4e5ca0: make $ref work everywhere, not just inside schemas (#838)
- d00f6d7: Update usage docs for installing Counterfact as a dependency

## 0.38.3

### Patch Changes

- 49733d6: configure JSONSchemaFaker to not fail on invalid types

## 0.38.2

### Patch Changes

- 729a8e1: added an announcement about impeding 1.0 release

## 0.38.1

### Patch Changes

- b3ab833: fix a type checking issue where the response type has no headers or content
- 30440ae: fixed an edge case with types when the response type has some optional headers

## 0.38.0

### Minor Changes

- 9e7923c: strengthen the return type of an operation (the return value of GET(), POST(), etc.)
- f4f377e: useless properties (like $.query when there are no query parameters) are now excluded from types
- b888e11: added a $.x object which is the same as $ but less type safe

## 0.37.2

### Patch Changes

- 7f70c2c: added a comment to the top of files under types/paths which links to an [FAQ on generated code](https://github.com/pmcelhaney/counterfact/blob/main/docs/faq-generated-code.md) -- thanks @ingovals for the [nudge](https://github.com/pmcelhaney/counterfact/issues/787)
- 7b4bdc2: fixed [#788](https://github.com/pmcelhaney/counterfact/issues/788): On Windows, the import field from types/paths to context gets wrong slashes while others are fine
- 9601b20: Allows Counterfact to handle requests that contain the OpenApi basePath

## 0.37.1

### Patch Changes

- 7e66fba: fix issue where hot reload did not work unless the code is in a package with type: module"
- 5742050: exit gracefully if running Node < 17

## 0.37.0

### Minor Changes

- f1c360e: Node >= 17 is now required
- c62b113: If a property is changed in \_.context.ts it will override runtime changes (See [#747](https://github.com/pmcelhaney/counterfact/issues/747)).

### Patch Changes

- ef4b6b3: fix an issue in which a file which is essential for type safety was not created (types.d.ts)
- 317fbaa: Fixed and simplified the way `\_.context.ts` files work.
  - it's no longer necessary to have a `_.context.ts` file in every directory, only the ones where you want to establish a new context
  - removed the need for `export type ContextType`

## 0.36.0

### Minor Changes

- 6460017: minor breaking change: `$.context.ts` is now `_.context.ts` and exports a class named Context

  See https://github.com/pmcelhaney/counterfact/blob/main/docs/context-change.md

### Patch Changes

- 8f028d5: CodeGenerator#watch() now waits until Chokidar completes its initial scan before resolving

## 0.35.0

### Minor Changes

- 479da6b: transpile TypeScript code to ES2022
- 8ab35b9: emit either CommonJS or ESM files depending on whether there's a package.json with type: module

  This change makes it possible to create modules that are imported into files in the paths directory.

## 0.34.2

### Patch Changes

- 0610da9: Fix issue 703: Endpoint with trailing slash

## 0.34.1

### Patch Changes

- c000cfc: Fixed: a handler function (GET(), PUT(), etc) should always return a response, even if that response is just a status code. If the handler doesn't return, the server will response with a 500 error.
- 4cdcb2d: fix: the optional flag for a parameter was inside quotes, making it part of the name rather than TypeScript syntax

## 0.34.0

### Minor Changes

- 47374ee: Partial support for XML (if anyone still uses XML). See https://swagger.io/docs/specification/data-models/representing-xml/
- 2366b50: Removed link to the dashboard / admin console because it's not really useful yet.
- 5c6cce9: Until now the dashboard hasn't gotten much attention. Added a logo and took some baby steps toward the planned design. https://excalidraw.com/#json=THGkyuKCGr_69fFqUrghd,ecIPAvDtoAOajwZ9G4m3sg

### Patch Changes

- 5c6cce9: fix links to open in VSCode

## 0.33.0

### Minor Changes

- 93d7607: added a ⬣> to the prompt to make it look more distinguished
- 960105a: just for fun, the tagline when the CLI starts is different every time you run it

### Patch Changes

- cf203d7: ignore the HTTP accept header if the response has no body

## 0.32.0

### Minor Changes

- 25933c2: fix an issue where the types.d.ts file was not copied over

## 0.31.0

### Minor Changes

- 24d96c3: created a new intro banner for the CLI

### Patch Changes

- 88cebcd: fixed an issue where if there was a directory and file with the same name, one would shadow the other

## 0.30.0

### Minor Changes

- 0dc11ea: added a --prefix option to specify prefix from which routes are served (e.g. /api/v1)

### Patch Changes

- 4de94f0: Update dependency @types/jest to v29.5.7
- 5f8e97b: chore(deps): update dependency @types/jest to v29.5.8

## 0.29.0

### Minor Changes

- 0069e9b: The list of routes on on the dashboard (http://localhost:3100/counterfact) is now determined on the fly
- 0069e9b: Regenerate code if the OpenAPI file changes while Counterfact is running
- f89691a: configure json-schema-faker to create between 0 and 20 items when it generates an array

## 0.28.0

### Minor Changes

- 33d05f9: configure json-schema-aker to create between 0 and 20 items when it generates an array

## 0.27.1

### Patch Changes

- 7eba726: got a little carried away with typeof; it's needed for the instance, not the class

## 0.27.0

### Minor Changes

- 836b61d: Fixed an issue where the context object wasn't working as expected.

  BREAKING CHANGE:
  - the main $.context.ts file needs an extra line: `export type ContextType = Context;`
  - $.context.ts files below the root need to change to `export type { ContextType } from "../$.context";`
  - if you modified any of the $.context.ts files below the root, treat the first bullet applies

  When you run Counterfact, it will try to make these changes for you, so ideally you won't have to worry about it.

## 0.26.3

### Patch Changes

- 5f02963: Fixes issue #593 where custom response headers were not being set

## 0.26.2

### Patch Changes

- 9d7bc5c: Fixes issue #585 where dispatcher.ts needs to use the matchedPath when calling the contextRegistry.find method

## 0.26.1

### Patch Changes

- dd0aecb: remove postinstall script that was preventing counterfact from installing

## 0.26.0

### Minor Changes

- 61ba2c9: the server code has been converted to TypeScript -- let me know if something stopped working
- 28d21f8: put generated JS code under a .cache directory and add that directory to .gitignore
- 61ba2c9: fix for OpenAPI 3 examples, which weren't read correctly (hardly anyone uses them)

## 0.25.5

### Patch Changes

- 8d86f34: make paths in URLs case-insensitive (http://localhost:3100/FOO is the same as http://localhost:3100/foo)
- f60874f: fix a few edge cases found when running against Github's extensive OpenAPI description: https://github.com/github/rest-api-description

## 0.25.4

### Patch Changes

- 7f2e19e: fixed an issue in which routes on the start page weren't rendered correctly in Windows

## 0.25.3

### Patch Changes

- 02676a8: Fix typescript-generator importStatements logic for relative paths

## 0.25.2

### Patch Changes

- 5523d0f: fixed another bug caused by backslashes in Windows

## 0.25.1

### Patch Changes

- 226ce37: fixed a couple more issues in Windows

## 0.25.0

### Minor Changes

- 5a9f40a: added a bunch more debug logging
- fix Windows issue where "http://" gets changed to "http:/" and as a result the app hangs

## 0.24.0

### Minor Changes

- e1bbb42: added a bit of debug logging (use environment variable DEBUG=counterfact to see it)
- 1ea478a: remove the dependency on ts-node -- path files are now compiled with Typescript and output to a paths-js directory

## 0.23.0

### Minor Changes

- 8ef5f41: Windows support! (maybe -- I don't have a Windows machine so I can't test directly)

## 0.22.0

### Minor Changes

- 4dcfa06: add CORS headers to support local development (Thanks, [dethell-jh](https://github.com/dethell-jh)!)

### Patch Changes

- dec64f4: Add CORS headers

## 0.21.3

### Patch Changes

- 1d13668: fix an issue where the random() function doesn't recognize it should use OpenAPI2

## 0.21.2

### Patch Changes

- 9ca754f: fix another bug where OpenAPI2 puts the produces proprty in the root

## 0.21.1

### Patch Changes

- 65f081b: fix error when the produces content type is defined at the root

## 0.21.0

### Minor Changes

- 9e0e4d3: it's Friday ¯\_(ツ)\_/¯

## 0.20.6

### Patch Changes

- d975833: fix an issue where ts-node was not being used, which basically broke everything

## 0.20.5

### Patch Changes

- 7d05529: fix $.proxy() -- it's better but still experimental

## 0.20.4

### Patch Changes

- 74c98aa: Fix: Found an error when headers name contains `-` (thanks [@hireza](https://github.com/hireza)!)

## 0.20.3

### Patch Changes

- d2a3023: fix issues which made --proxy-url completely broken

## 0.20.2

### Patch Changes

- 120eb52: fixes an issue where files may not be treated as ESM

## 0.20.1

### Patch Changes

- bb8f5f4: fix an issue causing all endpoints to return 404

## 0.20.0

### Minor Changes

- 3c78a07: support for enum values in schemas

### Patch Changes

- b2bf1db: fix duplicate imports of Context object
- 0f4ead6: don't import HTTPStatusCode if not needed
- 8e4410c: redirect /counterfact to counterfact/

## 0.19.1

### Patch Changes

- ab730a8: fix an issue where top-level produces in OpenAPI 2 was not working

## 0.19.0

### Minor Changes

- 196f7f4: new `--proxyURL <url>` CLI option and `.proxy [on|off]` command in the REPL

## 0.18.0

### Minor Changes

- 1244b6e: support for allOf, anyOf, oneOf, and not

### Patch Changes

- 1d360bd: OpenAPI 2 -- fall back to top-level produces and consumes

## 0.17.0

### Minor Changes

- 052db18: requires ts-node to be installed globally (for now)

## 0.16.0

### Minor Changes

- b99a1ed: fault tolerance: the server will not crash due to a syntax error
- b99a1ed: run TypeScript directly via ts-node loader instead of putting JS files on disk

## 0.15.1

### Patch Changes

- b7509d9: fix an issue where importing from $.context.ts did not work

## 0.15.0

### Minor Changes

- 78c0c31: return $.proxy(url) to proxy to another server
- 6bf3d42: $context.ts -> $.context.ts
- 7c2893a: change rapidoc configuration to show paths in the nav bar
- 033c067: new landing page with links to Rapidoc and Swagger UI
- 6bf3d42: improve and document the REPL

### Patch Changes

- a2d6bf0: always start the server regardless of which command line options are present
- 4a96dfa: fix crash when a path is not found

## 0.14.0

### Minor Changes

- b177d1d: rebuilt (but very rough) landing page using rapidoc

## 0.13.3

### Patch Changes

- 9e457bd: Add OpenApi2 host property support

## 0.13.2

### Patch Changes

- 8f472c9: change the way JSONSchemaFaker is imported to avoid CJS -> ESM issues

## 0.13.1

### Patch Changes

- 30baae9: a couple of fixes to improve OpenAPI 2 support
- b212793: use OpenAPI to convert strings in path/query/header to numbers at runtime

## 0.13.0

### Minor Changes

- e141c46: Experimental support for OpenAPI 2

## 0.12.0

### Minor Changes

- 1a622d2: a REPL allows you to interact with the server's context programatically

## 0.11.0

### Minor Changes

- 5a7e12b: --open opens the browser to a landing page with pointers to the code, Swagger, and the docs

## 0.10.3

### Patch Changes

- f1360ba: made the generated code a bit cleaner

## 0.10.2

### Patch Changes

- d8cbc41: fix swagger-ui when the openapi doc has a host property
- d8cbc41: ensure a $context.ts file is created in every directory
- 15270ed: remove dead code in operation-coder.js
- c7a928f: encode non-alphanumeric name as valid variable names

## 0.10.1

### Patch Changes

- 02efcd5: fix so that Counterfact no longer depends on itself

## 0.10.0

### Minor Changes

- 7e6028c: reworked CLI: generate code then optionally start the server, Swagger UI, open a browser

### Patch Changes

- Updated dependencies [7e6028c]
  - counterfact@0.10.0

## 0.9.0

### Minor Changes

- 88ed486: new $context.ts files which are used to define the server context / state

### Patch Changes

- Updated dependencies [88ed486]
  - counterfact@0.9.0

## 0.8.0

### Minor Changes

- 920504a: when encoding JSON schema in TypeScript, mark object properties as optional unless they are required
- 92dc769: the open API document can now be loaded from a URL rather than a local path
- ed44ba4: fix so that response[statusCode].random() can use the OpenAPI spec
- 5a767e7: the generated code for a path now uses response[statusCode].random() instead of a bunch of ugly boilerplate

### Patch Changes

- a1de4c0: add headers to the generated response type
- 86c1412: fix an issue where random() wasn't reading the examples right
- Updated dependencies [a1de4c0]
- Updated dependencies [920504a]
- Updated dependencies [86c1412]
- Updated dependencies [92dc769]
- Updated dependencies [ed44ba4]
- Updated dependencies [5a767e7]
  - counterfact@0.8.0

## 0.7.0

### Minor Changes

- 4f3c7c9: define a ResponseBuilder type -- to be refined later with one or more generic arguments
- 5f3ee3f: response builder fluent API which is going to make intellisense with TypeScript awesome
- 6221e7d: `counterfact start` command to start a server
- a3dfb48: `npm counterfact init <openapi-file> <destination>` command to build a new package with a Counterfact server
- 9f91d57: adds a 'go' command that generates code and starts the server in one step
- 25dcd45: ability to respond with multiple content types, return the best match for the request's accept header
- c84a4f4: Counterfact is now able to read an OpenAPI document and use it to generate a random response.
- c0cb938: a function can now return "hello world" as shorthand for `{status: 200, contentType: "text/plain", body: "hello world"}`

### Patch Changes

- 69b4598: replaced EventEmitter with EventTarget
- a07c2b2: fix a crash when regenerating code
- 85c3349: fixed an issue where hot reload did not work in some cases
- 1551cbb: handle additionalProperties when converting a JSON Schema to TypeScript

## 0.6.0

### Minor Changes

- 9161d80: Setup basic devcontainer.

### Patch Changes

- 6d01563: fixed the generate script in the main package (yarn generate wasn't doing anything)
- 6f406c4: fixed an issue where the generated JSON schema was changing integer types to number
- 6f406c4: fixed an issue where a response with no content was blowing up

## 0.5.0

### Minor Changes

- 5e72a6c: CLI to generate TypeScript files
- de5e92b: use example values (if present) when generating random data

## 0.4.0

### Minor Changes

- ab38cb2: add a tools.randomFromSchema(schema: JSONSchema) function

## 0.3.0

### Minor Changes

- 406b907: Add a tools object that will be provided to the request

## 0.2.0

### Minor Changes

- 741e4fe: change path parameters from [this] to {this} for consistency with OpenAPI
- f237c38: proof of concept specifying routes with TypeScript and ts-node

### Patch Changes

- 420cd52: return a 404 with a helpful error message when a handler for a route does not exist
- c11a475: allow the intial context (nee "store") to be passed as the second argument to `counterfact()`

## 0.1.2

### Patch Changes

- 3829a83: fix changeset access configuration (https://github.com/changesets/changesets/issues/503)

## 0.1.1

### Patch Changes

- 4c2bad8: build: add npm token to the release workflow

## 0.1.0

### Minor Changes

- 719d932: support for HTTP response code
- a5cd8d4: Filled out missing properties in package.json.
  - Deleted the original index.js file that does nothing.
  - This is the first release that's actually usable.

### Patch Changes

- 6101623: Update the demo app to work with recent API changes
- 95f3ca2: no changes -- just trying to get a Github action to run
