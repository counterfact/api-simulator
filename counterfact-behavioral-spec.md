# Counterfact Behavioral Specification

## 0) Scope and compatibility target

This document specifies Counterfact as a black-box system: observed CLI behavior, generated artifacts, runtime behavior, REPL behavior, and configuration semantics.

- This is **not** an implementation guide.
- Internal module structure, source file names, and algorithms are out of scope unless externally observable.
- Behaviors described as “must” are compatibility expectations for alternative implementations.

---

## 1) User-facing commands and CLI behavior

### What the user can do

- Start Counterfact with positional arguments:
  - `counterfact [spec] [destination]`
- Start in OpenAPI-free mode:
  - `counterfact` (equivalent to default `spec` of `_`)
  - `counterfact _ api`
- Use named flags for generation, watching, serving, REPL, validation, proxying, overlays, admin API, and config-file loading.

### Accepted inputs

- `spec` accepts:
  - Local file path
  - URL
  - `_` sentinel for OpenAPI-free mode
- `destination` accepts a path, default `.`
- Supported options include (non-exhaustive):
  - `--port <number>` (default `3100`)
  - `--generate`, `--generate-types`, `--generate-routes`
  - `--watch`, `--watch-types`, `--watch-routes`
  - `--serve`, `--repl`, `--build-cache`
  - `--spec <path-or-url>` (alternative to positional `spec`)
  - `--overlay <path-or-url>` (repeatable)
  - `--proxy-url <url>`
  - `--prefix <path>`
  - `--no-validate-request`, `--no-validate-response`
  - `--admin-api`, `--admin-api-token <token>`
  - `--config <path>`

### Outputs and side effects

- `--help` prints usage/arguments/options and exits successfully.
- Startup prints an introduction/banner and URLs.
- If no action flags are provided, default actions are enabled (generate, watch, serve, repl, build-cache).
- If legacy layout is detected, migration messages are printed.

### Deterministic requirements

- CLI option parsing and defaults are deterministic for identical argv/config/environment.
- `--spec <value>` (string) must take precedence over positional `spec` and shift positional interpretation as documented.
- CLI-specified values override config-file values.

### Error behavior

- On fatal startup errors, process prints a user-visible `❌ <message>` and exits non-zero.
- `--config <path>` with missing file must error.

### Example behaviors

- `counterfact --help` shows defaults (`spec` default `_`, `destination` default `.`).
- `counterfact --spec ./openapi.yaml ./api --generate` generates routes/types under `./api`.

### Testable assertions

- Assert `--help` includes expected argument defaults and option defaults.
- Assert `--spec` form generates expected files.
- Assert missing explicit config path fails with “Config file not found”.

---

## 2) Inputs, outputs, flags, defaults, and error behavior

### What the user can do

- Control startup composition via action flags.
- Disable update check and request/response validation via `--no-*` flags.

### Accepted inputs

- Boolean flags (`--serve`, `--repl`, etc.)
- Numeric port
- Paths/URLs for spec/overlays/config

### Outputs and side effects

- When `--open` is set, browser opens after startup.
- Response validation errors are exposed as advisory `response-type-error` headers (response body still returned).
- Request validation failures produce HTTP 400 by default.

### Deterministic requirements

- With same spec, route code, and request, validation on/off behavior is stable.
- Repeatable flags (e.g., overlays) preserve order and apply in that order.

### Error behavior

- Invalid config structure (YAML scalar/list instead of mapping) fails with clear config-type error.
- Invalid file paths (e.g., NUL bytes) fail as file-read errors.

### Example behaviors

- `counterfact openapi.yaml api --no-validate-request` allows schema-invalid request shapes that would otherwise be 400.
- `counterfact openapi.yaml api --overlay a.yaml --overlay b.yaml` applies overlay `a` then `b`.

### Testable assertions

- Verify default request validation returns 400 for invalid request payload.
- Verify `--no-validate-request` changes same request outcome.
- Verify invalid YAML root type returns config-shape error.

---

## 3) Generated project/file behavior

### What the user can do

- Generate scaffolded route handlers and typed contracts from spec.
- Regenerate after spec changes without losing route edits.

### Accepted inputs

- Spec path/URL (or multiple specs through config)
- Destination directory
- Generation flags (`--generate*`, `--watch*`, `--prune`)

### Outputs and side effects

- Creates:
  - `routes/` (editable by user)
  - `types/` (auto-generated; treated as generated artifacts)
- Creates compiled cache under `.cache/` when cache/build path is exercised.
- In multi-spec/group mode, emits grouped directories and group-specific `types/versions.ts` for versioned groups.

### Deterministic requirements

- File layout is deterministic from `(spec set, group/version/prefix config, destination)`.
- Regeneration must not overwrite existing user route files; only add missing scaffolds and refresh generated types.

### Error behavior

- Generation fails non-zero on unrecoverable spec/config errors.

### Example behaviors

- For `/ping` in spec, `routes/ping.ts` is generated and exports a handler (e.g., `GET`).
- `types/*` are regenerated when spec changes.

### Testable assertions

- Assert generated `routes/ping.ts` exists and includes handler export.
- Modify an existing route file, regenerate, and assert the custom edit remains.
- Assert `.cache/*.cjs` appears when cache build is enabled.

---

## 4) Runtime behavior

### What the user can do

- Start HTTP server for generated and custom routes.
- Access Swagger UI endpoint.
- Run with proxying, middleware, admin API, and validation controls.

### Accepted inputs

- HTTP requests matching generated/custom routes.
- Route handlers returning Counterfact response objects or compatible return values.

### Outputs and side effects

- Serves API endpoints under configured prefix/group/version paths.
- Serves Swagger UI at `/counterfact/swagger` under current base URL prefixing behavior.
- Returns handler-defined status/body/headers/cookies.

### Deterministic requirements

- For deterministic handlers (no randomness/time dependencies), responses must be deterministic.
- Route mounting for configured prefixes/groups/versions must be deterministic.

### Error behavior

- Missing routes return 404.
- Handler/runtime startup failures are surfaced as process-level startup errors.

### Example behaviors

- `GET /ping` returns configured route response (`pong` in black-box fixture).
- Multi-API config with prefixes serves each API at its own prefix and leaves unprefixed path 404.

### Testable assertions

- Assert `/counterfact/swagger` is 200 after startup.
- Assert prefixed routes return expected content and unprefixed equivalent returns 404.

---

## 5) Route handler loading and hot reload behavior

### What the user can do

- Edit route/context files while server is running.
- Update local OpenAPI file while watching.

### Accepted inputs

- File changes to route handlers, context files, and watched OpenAPI docs.

### Outputs and side effects

- Changed handlers are picked up without process restart.
- In-memory context state survives route hot reload.
- Local spec edits can update generated behavior (e.g., example-driven outputs) without restart when watch paths are active.

### Deterministic requirements

- Once a file change is observed and loaded, subsequent requests must use new behavior.
- Prior context state persists across handler reload boundaries.

### Error behavior

- Context file syntax/import failures are warned and skipped so app can continue.

### Example behaviors

- Editing a route to return binary via `$.response[200].binary(...)` eventually changes live response bytes/content-type.
- Rewriting local spec example from `original` to `reloaded` eventually changes returned response example.

### Testable assertions

- Poll endpoint after route file edit until new response observed.
- Seed state, edit handler, and assert state still present post-reload.
- Poll endpoint after spec rewrite until updated example observed.

---

## 6) REPL behavior

### What the user can do

- Interactively inspect and mutate live state via `context`.
- Send HTTP requests via `client`.
- Build validated requests via `route(...)` builder (`ready`, `missing`, `help`, `send`).
- Toggle proxy behavior via `.proxy ...` commands.
- Run scenario functions via `.scenario ...`.

### Accepted inputs

- JavaScript expressions and statements.
- Dot-commands for REPL controls (`.proxy`, `.scenario`, plus built-in REPL controls).

### Outputs and side effects

- Evaluates expressions against live runtime objects.
- Can mutate server state immediately.
- `route(...).send()` emits request and returns response.
- Scenario execution can mutate context and store preconfigured route builders.

### Deterministic requirements

- For identical runtime state and command sequence, REPL-evaluated outcomes are deterministic.
- Scenario path resolution is deterministic:
  - last segment = export name
  - preceding segments = file path under `scenarios/`
  - default file = `scenarios/index.ts`

### Error behavior

- Missing/invalid scenario command args show usage guidance.
- If `startup` scenario export is absent, startup scenario is skipped without error.
- Route builder `send()` throws when required parameters are missing.

### Example behaviors

- `.scenario soldPets` maps to `scenarios/index.ts` export `soldPets`.
- `.proxy on /payments` enables proxy for that subtree.

### Testable assertions

- REPL script can call `context` methods and observe reflected HTTP responses.
- `.scenario` command invokes expected file/export resolution.
- `route(...).method("get").send()` without required path args throws descriptive missing-params error.

---

## 7) Context/state behavior

### What the user can do

- Define `Context` classes in `_.context.ts` for subtree-scoped state.
- Use `$.context` inside handlers.
- Load sibling/parent contexts via `loadContext(path)`.

### Accepted inputs

- Class-based context logic in TypeScript/JavaScript.
- Optional constructor dependencies (e.g., `loadContext`, `readJson`).

### Outputs and side effects

- Mutable in-memory state shared across routes in same context scope.
- Nested scopes may have distinct contexts while still being cross-accessible.
- State resets on process restart.

### Deterministic requirements

- Context lookup by path is stable and deterministic.
- Context sharing boundaries are deterministic by nearest `_.context.ts` ancestor.

### Error behavior

- Invalid context modules are skipped with warning instead of crashing whole server.

### Example behaviors

- POST writes to `$.context`, subsequent GET reads same data.
- `loadContext("/users")` from another subtree reads shared users state.

### Testable assertions

- Create two routes sharing a context; assert write/read roundtrip.
- Create nested contexts; assert nearest-context resolution and explicit cross-load behavior.

---

## 8) Type generation behavior

### What the user can do

- Import generated handler types and rely on compile-time schema alignment.
- Use generated response builders with schema-driven methods (`random`, `example`, etc.).
- In versioned APIs, use version-aware `$` typing (`version`, `minVersion`) through generated types.

### Accepted inputs

- OpenAPI request/response schemas, examples, params, headers.
- Multi-spec version configs (`group`, `version`, optional `prefix`).

### Outputs and side effects

- Generates strongly typed handler signatures and payload contracts.
- Emits generated JSDoc from OpenAPI descriptions.
- Emits group-local `types/versions.ts` when any spec in group is versioned.

### Deterministic requirements

- For fixed input specs/config, generated type surface is deterministic.
- Version ordering semantics follow config declaration order.

### Error behavior

- Invalid/unsupported schema constructs should fail generation with clear errors.
- Handler/contract mismatches are compile-time TypeScript errors in user projects.

### Example behaviors

- `$.response[200].json(...)` is type-checked to response schema.
- `$.minVersion("v2")` narrows handler `$` type in versioned handlers.

### Testable assertions

- TSD tests fail on intentional schema mismatch in handler return type.
- Multi-version fixture produces expected `types/versions.ts` and narrowing behavior.

---

## 9) Configuration behavior

### What the user can do

- Provide options in `counterfact.yaml` (default lookup in CWD).
- Override config file path with `--config <path>`.
- Use kebab-case or camelCase keys in config.
- Define `spec` as string, object, or array for multi-spec configuration.

### Accepted inputs

- YAML mapping document.
- Keys corresponding to CLI options plus `destination` and structured `spec` entries.

### Outputs and side effects

- Missing default config file behaves as empty config.
- Missing explicitly requested config file is an error.
- Kebab-case keys normalize to camelCase internally.
- `destination` from config applies when destination positional arg is default `.`.

### Deterministic requirements

- Merge rule is deterministic: CLI value wins over config value for same option.
- Unknown config keys are ignored (no crash).

### Error behavior

- YAML list/scalar root errors (“must be a YAML object”).
- Nonexistent required config path errors (“Config file not found”).

### Example behaviors

- `counterfact --config ./counterfact.yaml` loads that file.
- `proxy-url:` in YAML behaves equivalently to `proxyUrl:`.

### Testable assertions

- Assert missing default config does not fail.
- Assert missing explicit config does fail.
- Assert kebab-case normalization and CLI precedence over config values.

---

## 10) Edge cases and observable failure modes

### Notable edge cases

- Paths containing colon characters are routable.
- OpenAPI-free mode (`spec` = `_`) allows manually authored routes without spec-driven generation.
- Overlay remove/update actions can remove endpoints or alter served examples.
- Multi-API serves different specs under distinct prefixes/groups in one process.

### Failure modes

- Startup timeout / server-not-ready situations in external harnesses.
- Invalid configuration shape or missing required config file.
- Missing required route-builder parameters in REPL `send()`.
- Validation failures (request-side 400; response-side advisory headers).

### Deterministic requirements

- Given same inputs and file state, failure category and user-visible error message class should be stable.

### Example behaviors

- Overlay removing `$.paths['/beta']` causes `/beta` route file absence after generation.
- Updating overlay examples changes live served value after startup/watch processing.

### Testable assertions

- Black-box: assert colon path works.
- Black-box: assert overlay remove omits generated route file.
- Black-box: assert overlay update changes served response payload.

---

## 11) Conformance test matrix (minimum)

An alternative implementation should pass at least these black-box checks:

1. **CLI contract**: `--help` shape, defaults, and key options.
2. **Single-spec generate+serve**: route file generation + live endpoint behavior.
3. **No-OpenAPI mode**: `_` and no-arg startup semantics.
4. **Config precedence**: CLI overrides YAML; missing explicit config fails.
5. **Hot reload**: route edit reflected without restart; context preserved.
6. **Spec reload (local file)**: changed example reflected at runtime.
7. **REPL essentials**: `context`, `client`, `.scenario`, `.proxy`, route-builder missing-param errors.
8. **Validation toggles**: request/response validation on/off externally visible differences.
9. **Multi-API**: grouped/prefixed route mounting and grouped generation outputs.
10. **Overlay semantics**: ordered overlay application with remove/update behavior.

This matrix is intentionally implementation-agnostic: it verifies observable behavior only.
