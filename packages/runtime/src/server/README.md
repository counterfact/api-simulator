# `src/server/` — Runtime Services

This directory owns dispatch, registries, module loading, validation, state,
and file watching. The facade composes these services; the runtime accepts
narrow interfaces rather than importing the facade's `ApiRunner` or `Config`.
The public entrypoints are described in the
[`@counterfact/runtime` guide](../../README.md).

## Key modules

| File                                                                        | Responsibility                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `../runtime-config.ts`                                                      | Runtime-owned dispatcher, proxy, Koa, and Admin API interfaces; the facade supplies adapters for product configuration and telemetry policy |
| `constants.ts`                                                              | Shared Chokidar watcher options, including polling on Windows                                                                               |
| `dispatcher.ts`                                                             | Route matching, request inputs, handler invocation, content negotiation, and response validation                                            |
| `registry.ts`                                                               | Registered route modules and their HTTP method handlers                                                                                     |
| `context-registry.ts`                                                       | Hierarchical context lookup with case-insensitive path matching and state-preserving reload updates                                         |
| `scenario-registry.ts`                                                      | Loaded scenario modules and exported functions                                                                                              |
| `store-loader.ts`                                                           | Shared store construction and reload integration                                                                                            |
| `module-loader.ts`                                                          | Route, context, middleware, and scenario loading plus watcher-driven reloads                                                                |
| `module-tree.ts` and `module-dependency-graph.ts`                           | Route-directory structure and module dependency relationships used during loading/reload                                                    |
| `transpiler.ts`                                                             | SWC compilation to cached `.cjs` modules in compiled mode                                                                                   |
| `uncached-import.ts` and `uncached-require.cjs`                             | Cache-bypassing module loading for hot reload                                                                                               |
| `determine-module-kind.ts` and `convert-js-extensions-to-cjs.ts`            | Module-format selection and compiled import-path handling                                                                                   |
| `openapi-document.ts`, `load-openapi-document.ts`, and `openapi-watcher.ts` | Runtime contract access, loading through `@counterfact/openapi`, and spec watching                                                          |
| `request-validator.ts` and `response-validator.ts`                          | Validation at the handler's HTTP boundary                                                                                                   |
| `response-builder.ts` and `json-to-xml.ts`                                  | Response construction, cookies, examples/random bodies, streaming, and XML conversion                                                       |
| `tools.ts`                                                                  | Handler helpers such as `oneOf`, `accepts`, and `randomFromSchema`                                                                          |
| `is-proxy-enabled-for-path.ts`                                              | Closest-ancestor proxy routing with explicit descendant overrides                                                                           |
| `update-queue.ts`                                                           | Serialized runtime updates                                                                                                                  |

## Koa adapter

`web-server/create-koa-app.ts` exports
`createKoaApp({ runners, config, adminApi?, lifecycle? })` through
`@counterfact/runtime/koa`. It accepts structural `RuntimeRunner[]` views,
`KoaRuntimeConfig`, and an optional facade-owned `AdminApiAdapter`. An adapter
is required when `startAdminApi` is enabled. The function returns a configured
Koa application; binding and simulator lifecycle orchestration belong to the
facade.

| Module                                             | Mount / responsibility                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `web-server/openapi-middleware.ts`                 | `/counterfact/openapi${runner.subdirectory}`; serves the selected contract with its request URL prefix |
| Swagger UI setup in `web-server/create-koa-app.ts` | `/counterfact/swagger${runner.subdirectory}`; selects the matching version's document                  |
| `web-server/admin-api-middleware.ts`               | `/_counterfact/api${runner.subdirectory}`; opt-in context/configuration/route inspection and mutation  |
| `web-server/routes-middleware.ts`                  | `runner.prefix`; dispatches served API requests and applies configured proxy routing                   |

Documentation/Admin API group subdirectories are separate from the served-route
prefix. Versioned runners can share a documentation pathname; OpenAPI and
Swagger selection also considers the version query. Admin API requests require
the configured bearer token, or a loopback request IP when no token is set.

The adapter also installs body parsing, JSON response serialization, and the
optional lifecycle admission/drain hooks used during reset. Requests reach the
dispatcher after the middleware selects the matching runner.

## Hot reload

In compiled mode, the transpiler writes `.cjs` modules under `.cache` and module
loading follows those outputs. In native TypeScript mode, the loader reads the
source route modules directly. Watchers and dependency tracking trigger
cache-bypassing reloads in both modes; ordinary context reloads preserve live
state. An explicit simulator reset reconstructs state separately.

Use [`test/server/`](../../test/server/) for focused runtime tests and the
[runtime architecture skill](../../../../.agents/skills/counterfact-runtime-architecture/SKILL.md)
for lifecycle and hot-reload invariants.
