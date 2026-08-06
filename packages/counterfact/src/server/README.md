# `src/server/` — HTTP Server

This directory contains the request dispatching engine, route registry, module loading system, and all supporting server infrastructure.

A dedicated sub-directory holds every file related to the Koa HTTP layer:

- **`web-server/`** — Koa application factory and all Koa middleware (see below)

## Files

| File                              | Description                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                       | Defines the `Config` interface that holds all runtime configuration (port, paths, proxy settings, feature flags)           |
| `constants.ts`                    | Exports Chokidar file-watcher options used for platform-specific file monitoring                                           |
| `dispatcher.ts`                   | Core request router: matches URL paths to route handlers, extracts path/query parameters, and drives the request lifecycle |
| `registry.ts`                     | In-memory store of all registered routes and their HTTP method handlers                                                    |
| `context-registry.ts`             | Hierarchical store of context objects; provides path-based lookup and case-insensitive matching                            |
| `module-loader.ts`                | Dynamically loads compiled route, context, and middleware modules; triggers hot-reload on file changes                     |
| `module-tree.ts`                  | Organises loaded modules into a tree that mirrors the routes directory structure for efficient path matching               |
| `module-dependency-graph.ts`      | Tracks inter-module dependencies so that reloading a changed file also reloads its dependents                              |
| `transpiler.ts`                   | Compiles `.ts` route files to `.cjs` using SWC; watches source files and recompiles on change                              |
| `uncached-import.ts`              | Imports an ES module bypassing the module cache (used for hot-reload of ESM route files)                                   |
| `uncached-require.cjs`            | CommonJS wrapper that clears the `require` cache entry before re-importing a module                                        |
| `determine-module-kind.ts`        | Detects whether a compiled file should be loaded as ESM or CJS based on extension or `package.json`                        |
| `convert-js-extensions-to-cjs.ts` | Rewrites relative `require()` paths to use `.cjs` extensions for CommonJS compatibility                                    |
| `response-builder.ts`             | Constructs synthetic response payloads from OpenAPI schemas, handling JSON, XML, and content negotiation                   |
| `tools.ts`                        | Utility functions injected into route handlers: `randomFromSchema()`, `accepts()`, etc.                                    |
| `json-to-xml.ts`                  | Converts a JSON value to XML text using schema hints from the OpenAPI document                                             |
| `is-proxy-enabled-for-path.ts`    | Checks whether a given URL path should be forwarded to the upstream proxy                                                  |
| `precinct.d.ts`                   | TypeScript declaration for the `precinct` dependency-analysis library                                                      |

## `web-server/` — Koa HTTP Layer

Each middleware constructor takes a **path prefix as its first argument** so that `createKoaApp` makes it immediately clear which paths each middleware handles.

`createKoaApp` accepts an array of `ApiRunner` instances (`runners: ApiRunner[]`). For each runner it mounts the OpenAPI document endpoint, Swagger UI, Admin API (when enabled), and route-dispatching middleware — all using `runner.subdirectory` to disambiguate paths when multiple specs are in use.

| File                      | Path prefix                                    | Description                                                                                  |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `create-koa-app.ts`       | —                                              | Factory that builds and configures the Koa application with all middleware attached          |
| `openapi-middleware.ts`   | `/counterfact/openapi${runner.subdirectory}`   | Serves the OpenAPI specification document (single path) with the current server URL injected |
| `koa-middleware.ts`       | `runner.prefix`                                | Primary Koa middleware: delegates each request to the Dispatcher and formats the response    |
| `admin-api-middleware.ts` | `/_counterfact/api${runner.subdirectory}`      | REST API for managing server state (proxy settings, etc.); restricted to loopback clients    |

## How It Works

```
Incoming HTTP request
        │
        ▼
┌───────────────────┐
│  Koa Middleware   │  (web-server/)
│  Chain            │
│  ┌─────────────┐  │
│  │ openapi-mw  │  │  Serves /counterfact/openapi
│  ├─────────────┤  │
│  │ swagger-ui  │  │  Serves /counterfact/swagger
│  ├─────────────┤  │
│  │ admin-api   │  │  Manages state at /_counterfact/api
│  ├─────────────┤  │
│  │ koa-mw      │  │  Routes to Dispatcher at prefix
│  └─────────────┘  │
└────────┬──────────┘
         │
         ▼
┌────────────────────┐
│    Dispatcher      │  (dispatcher.ts)
│                    │
│  1. Match path     │──▶ Registry (route handlers)
│  2. Extract params │
│  3. Call handler   │──▶ ContextRegistry (context objects)
│  4. Build response │──▶ ResponseBuilder
└────────────────────┘
```

### Hot Reload Flow

```
File saved on disk
       │
       ▼
  Transpiler            (transpiler.ts)
  recompiles .ts → .cjs
       │
       ▼
  ModuleLoader          (module-loader.ts)
  clears cache, re-imports module
       │
       ▼
  Registry updated      (registry.ts)
  New handler available immediately
```
